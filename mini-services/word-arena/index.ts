import { createServer } from 'http'
import { Server, type Socket } from 'socket.io'

// ============================================================================
// GLYPH — word-arena socket.io mini-service
// Standalone real-time multiplayer relay for duel mode.
// The secret word is NEVER sent over the socket — the server only relays
// COLOR-ONLY progress (correct | present | absent) between opponents.
// ============================================================================

// ---------- Types ----------

type PlayerStatus = 'online' | 'idle' | 'playing' | 'offline'
type RoomState = 'waiting' | 'playing' | 'finished'
type TileStatus = 'correct' | 'present' | 'absent'
type ChatType = 'user' | 'system'

interface Player {
  id: string
  name: string
  avatarSeed: string
  status: PlayerStatus
  roomId: string | null
}

interface Room {
  id: string
  players: string[] // socket IDs
  hostId: string | null
  state: RoomState
  wordSeed: string | null
  matchStartedAt: number | null
  maxGuesses: number
  finishedPlayers: Set<string> // socket IDs that have called game:finish
}

// Public-facing player shape (sent to clients)
interface PlayerPublic {
  id: string
  name: string
  avatarSeed: string
  status: PlayerStatus
}

// room:state payload
interface RoomStatePayload {
  id: string
  players: PlayerPublic[]
  hostId: string | null
  state: RoomState
  wordSeed: string | null
  matchStartedAt: number | null
  maxGuesses: number
}

// chat:message payload
interface ChatMessagePayload {
  id: string
  name: string
  avatarSeed: string
  content: string
  type: ChatType
  ts: number
}

// ---------- Client → Server payload types ----------

interface PlayerIdentifyPayload {
  id: string
  name: string
  avatarSeed: string
}
interface RoomCreatePayload {
  name: string
  avatarSeed: string
  playerId: string
}
interface RoomJoinPayload {
  roomId: string
  name: string
  avatarSeed: string
  playerId: string
}
interface RoomChatPayload {
  content: string
}
interface RoomReactionPayload {
  emoji: string
}
interface GameStartPayload {
  roomId: string
}
interface GameProgressPayload {
  roomId: string
  attempt: number
  statuses: TileStatus[]
  final: boolean
}
interface GameTypingPayload {
  roomId: string
  typing: boolean
}
interface GameFinishPayload {
  roomId: string
  won: boolean
  guessesUsed: number
  durationMs: number
}
interface PresenceUpdatePayload {
  status: PlayerStatus
}

// ---------- Constants ----------

const PORT = 3003
const ROOM_CODE_LENGTH = 6
const MAX_PLAYERS_DUEL = 2
const MAX_CHAT_LENGTH = 200
const MAX_GUESSES = 6

// Room code alphabet — no ambiguous chars (O/0/I/1)
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
// Validation: 6 uppercase alphanumerics (strict generation excludes O/0/I/1)
const ROOM_ID_REGEX = /^[A-Z0-9]{6}$/

const ALLOWED_EMOJIS = ['🔥', '😂', '😱', '👏', '🤔', '⚡'] as const
const ALLOWED_STATUSES: PlayerStatus[] = ['online', 'idle', 'playing', 'offline']
const VALID_TILE_STATUSES: TileStatus[] = ['correct', 'present', 'absent']

// ---------- In-memory state ----------

const players = new Map<string, Player>() // socketId → Player
const rooms = new Map<string, Room>() // roomId → Room

// ---------- Helpers ----------

const log = (...args: unknown[]) => console.log('[word-arena]', ...args)
const logError = (...args: unknown[]) => console.error('[word-arena]', ...args)

function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  // Guarantee uniqueness (extremely unlikely collision, but be safe)
  if (rooms.has(code)) return generateRoomCode()
  return code
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}

function generateWordSeed(): string {
  // Bun/Node provide crypto.randomUUID() globally
  return crypto.randomUUID()
}

function publicPlayer(p: Player): PlayerPublic {
  return { id: p.id, name: p.name, avatarSeed: p.avatarSeed, status: p.status }
}

function roomStatePayload(room: Room): RoomStatePayload {
  const playerList: PlayerPublic[] = room.players
    .map((sid) => players.get(sid))
    .filter((p): p is Player => !!p)
    .map(publicPlayer)
  return {
    id: room.id,
    players: playerList,
    hostId: room.hostId,
    state: room.state,
    wordSeed: room.wordSeed,
    matchStartedAt: room.matchStartedAt,
    maxGuesses: room.maxGuesses,
  }
}

function emitRoomState(roomId: string): void {
  const room = rooms.get(roomId)
  if (!room) return
  io.to(roomId).emit('room:state', roomStatePayload(room))
}

function systemMessage(content: string): ChatMessagePayload {
  return {
    id: generateId(),
    name: 'System',
    avatarSeed: 'system',
    content,
    type: 'system',
    ts: Date.now(),
  }
}

/**
 * Remove a socket from a room. Handles host transfer, room deletion when
 * empty, and notifies remaining occupants with room:state + a system chat
 * message. Does NOT mutate the Player object (caller manages player.roomId).
 */
function removePlayerFromRoom(
  socketId: string,
  roomId: string,
  reason: 'leave' | 'disconnect',
): void {
  const room = rooms.get(roomId)
  if (!room) return
  const player = players.get(socketId)

  room.players = room.players.filter((id) => id !== socketId)
  room.finishedPlayers.delete(socketId)

  // Transfer host if the departing socket was the host
  if (room.hostId === socketId) {
    room.hostId = room.players[0] ?? null
    if (room.hostId) {
      const newHost = players.get(room.hostId)
      log(`room ${roomId}: host transferred to ${newHost?.name ?? room.hostId}`)
    }
  }

  // If room is now empty, delete it
  if (room.players.length === 0) {
    rooms.delete(roomId)
    log(`room ${roomId} deleted (empty)`)
    return
  }

  // Notify remaining players of the new state
  emitRoomState(roomId)
  if (player) {
    io.to(roomId).emit(
      'chat:message',
      systemMessage(
        `${player.name} ${reason === 'disconnect' ? 'disconnected from' : 'left'} the arena`,
      ),
    )
  }
}

function emitError(socket: Socket, message: string): void {
  socket.emit('error', { message })
}

// ---------- Server setup ----------

const httpServer = createServer()
const io = new Server(httpServer, {
  // Caddy forwards to this service; path MUST be "/" — the frontend connects
  // with io("/?XTransformPort=3003")
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ---------- Connection lifecycle ----------

io.on('connection', (socket: Socket) => {
  log(`connected: ${socket.id}`)

  // ----- player:identify -----
  socket.on('player:identify', (data: PlayerIdentifyPayload) => {
    try {
      if (!data || typeof data.id !== 'string' || typeof data.name !== 'string') {
        throw new Error('Invalid identify payload')
      }
      // If already in a room, leave it first
      const existing = players.get(socket.id)
      if (existing?.roomId) {
        const oldRoom = existing.roomId
        socket.leave(oldRoom)
        removePlayerFromRoom(socket.id, oldRoom, 'leave')
      }
      players.set(socket.id, {
        id: data.id,
        name: data.name,
        avatarSeed: typeof data.avatarSeed === 'string' && data.avatarSeed ? data.avatarSeed : data.id,
        status: 'online',
        roomId: null,
      })
      log(`identified: ${data.name} (${data.id})`)
      socket.emit('player:ready', { id: data.id })
    } catch (err) {
      emitError(socket, errMsg(err, 'identify'))
      logError(`player:identify error: ${errMsg(err)}`)
    }
  })

  // ----- room:create -----
  socket.on('room:create', (data: RoomCreatePayload) => {
    try {
      if (!data || typeof data.playerId !== 'string' || typeof data.name !== 'string') {
        throw new Error('Invalid room:create payload')
      }
      // Leave previous room if any
      const existing = players.get(socket.id)
      if (existing?.roomId) {
        const oldRoom = existing.roomId
        socket.leave(oldRoom)
        removePlayerFromRoom(socket.id, oldRoom, 'leave')
      }
      // Register / overwrite player record
      players.set(socket.id, {
        id: data.playerId,
        name: data.name,
        avatarSeed:
          typeof data.avatarSeed === 'string' && data.avatarSeed ? data.avatarSeed : data.playerId,
        status: 'online',
        roomId: null,
      })
      const roomId = generateRoomCode()
      const room: Room = {
        id: roomId,
        players: [socket.id],
        hostId: socket.id,
        state: 'waiting',
        wordSeed: null,
        matchStartedAt: null,
        maxGuesses: MAX_GUESSES,
        finishedPlayers: new Set(),
      }
      rooms.set(roomId, room)
      const player = players.get(socket.id)!
      player.roomId = roomId
      socket.join(roomId)
      log(`room created: ${roomId} by ${data.name} (${data.playerId})`)
      socket.emit('room:created', { roomId })
      emitRoomState(roomId)
    } catch (err) {
      emitError(socket, errMsg(err, 'room:create'))
      logError(`room:create error: ${errMsg(err)}`)
    }
  })

  // ----- room:join -----
  socket.on('room:join', (data: RoomJoinPayload) => {
    try {
      if (!data || typeof data.roomId !== 'string' || typeof data.playerId !== 'string' || typeof data.name !== 'string') {
        throw new Error('Invalid room:join payload')
      }
      if (!ROOM_ID_REGEX.test(data.roomId)) {
        throw new Error('Invalid room ID format')
      }
      const room = rooms.get(data.roomId)
      if (!room) {
        throw new Error('Room not found')
      }
      // Already in this room — just re-emit state
      if (room.players.includes(socket.id)) {
        const playerList = room.players
          .map((sid) => players.get(sid))
          .filter((p): p is Player => !!p)
          .map(publicPlayer)
        socket.emit('room:joined', { roomId: data.roomId, players: playerList })
        emitRoomState(data.roomId)
        return
      }
      if (room.players.length >= MAX_PLAYERS_DUEL) {
        throw new Error('Room is full')
      }
      // Leave previous room if in a different one
      const existing = players.get(socket.id)
      if (existing?.roomId && existing.roomId !== data.roomId) {
        const oldRoom = existing.roomId
        socket.leave(oldRoom)
        removePlayerFromRoom(socket.id, oldRoom, 'leave')
      }
      // Register / overwrite player record
      players.set(socket.id, {
        id: data.playerId,
        name: data.name,
        avatarSeed:
          typeof data.avatarSeed === 'string' && data.avatarSeed ? data.avatarSeed : data.playerId,
        status: 'online',
        roomId: data.roomId,
      })
      room.players.push(socket.id)
      socket.join(data.roomId)
      log(`${data.name} joined room ${data.roomId}`)
      const playerList = room.players
        .map((sid) => players.get(sid))
        .filter((p): p is Player => !!p)
        .map(publicPlayer)
      socket.emit('room:joined', { roomId: data.roomId, players: playerList })
      emitRoomState(data.roomId)
      io.to(data.roomId).emit(
        'chat:message',
        systemMessage(`${data.name} entered the arena`),
      )
    } catch (err) {
      emitError(socket, errMsg(err, 'room:join'))
      logError(`room:join error: ${errMsg(err)}`)
    }
  })

  // ----- room:leave -----
  socket.on('room:leave', () => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) {
        throw new Error('Not in a room')
      }
      const roomId = player.roomId
      socket.leave(roomId)
      removePlayerFromRoom(socket.id, roomId, 'leave')
      player.roomId = null
      log(`${player.name} left room ${roomId}`)
    } catch (err) {
      emitError(socket, errMsg(err, 'room:leave'))
      logError(`room:leave error: ${errMsg(err)}`)
    }
  })

  // ----- room:chat -----
  socket.on('room:chat', (data: RoomChatPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) {
        throw new Error('Not in a room')
      }
      if (!data || typeof data.content !== 'string') {
        throw new Error('Invalid chat payload')
      }
      // Strip excessive whitespace + enforce length
      const content = data.content.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH)
      if (!content) {
        throw new Error('Empty message')
      }
      const message: ChatMessagePayload = {
        id: generateId(),
        name: player.name,
        avatarSeed: player.avatarSeed,
        content,
        type: 'user',
        ts: Date.now(),
      }
      io.to(player.roomId).emit('chat:message', message)
    } catch (err) {
      emitError(socket, errMsg(err, 'room:chat'))
      logError(`room:chat error: ${errMsg(err)}`)
    }
  })

  // ----- room:reaction -----
  socket.on('room:reaction', (data: RoomReactionPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) {
        throw new Error('Not in a room')
      }
      if (!data || typeof data.emoji !== 'string') {
        throw new Error('Invalid reaction payload')
      }
      if (!ALLOWED_EMOJIS.includes(data.emoji as (typeof ALLOWED_EMOJIS)[number])) {
        throw new Error('Emoji not allowed')
      }
      io.to(player.roomId).emit('room:reaction', {
        name: player.name,
        avatarSeed: player.avatarSeed,
        emoji: data.emoji,
        ts: Date.now(),
      })
    } catch (err) {
      emitError(socket, errMsg(err, 'room:reaction'))
      logError(`room:reaction error: ${errMsg(err)}`)
    }
  })

  // ----- game:start -----
  socket.on('game:start', (data: GameStartPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player) {
        throw new Error('Player not identified')
      }
      const roomId = (data && typeof data.roomId === 'string' && data.roomId) || player.roomId
      if (!roomId) {
        throw new Error('Not in a room')
      }
      const room = rooms.get(roomId)
      if (!room) {
        throw new Error('Room not found')
      }
      if (room.hostId !== socket.id) {
        throw new Error('Only the host can start the game')
      }
      if (room.players.length < 1) {
        throw new Error('Not enough players')
      }
      room.wordSeed = generateWordSeed()
      room.matchStartedAt = Date.now()
      room.state = 'playing'
      room.finishedPlayers.clear()
      log(`game started in room ${roomId} (seed: ${room.wordSeed})`)
      io.to(roomId).emit('game:started', {
        wordSeed: room.wordSeed,
        matchStartedAt: room.matchStartedAt,
        maxGuesses: room.maxGuesses,
      })
      emitRoomState(roomId)
    } catch (err) {
      emitError(socket, errMsg(err, 'game:start'))
      logError(`game:start error: ${errMsg(err)}`)
    }
  })

  // ----- game:progress -----
  socket.on('game:progress', (data: GameProgressPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) {
        throw new Error('Not in a room')
      }
      if (
        !data ||
        typeof data.attempt !== 'number' ||
        !Array.isArray(data.statuses)
      ) {
        throw new Error('Invalid progress payload')
      }
      // SECURITY: validate that statuses contain ONLY color codes, never letters
      for (const s of data.statuses) {
        if (!VALID_TILE_STATUSES.includes(s)) {
          throw new Error('Invalid tile status — letters are not allowed')
        }
      }
      // Relay to OTHER sockets in the room (never back to sender)
      socket.to(player.roomId).emit('opponent:progress', {
        name: player.name,
        avatarSeed: player.avatarSeed,
        attempt: data.attempt,
        statuses: data.statuses,
        final: !!data.final,
      })
    } catch (err) {
      emitError(socket, errMsg(err, 'game:progress'))
      logError(`game:progress error: ${errMsg(err)}`)
    }
  })

  // ----- game:typing -----
  socket.on('game:typing', (data: GameTypingPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) {
        throw new Error('Not in a room')
      }
      const typing = !!(data && data.typing)
      socket.to(player.roomId).emit('opponent:typing', {
        name: player.name,
        typing,
      })
    } catch (err) {
      emitError(socket, errMsg(err, 'game:typing'))
      logError(`game:typing error: ${errMsg(err)}`)
    }
  })

  // ----- game:finish -----
  socket.on('game:finish', (data: GameFinishPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) {
        throw new Error('Not in a room')
      }
      if (
        !data ||
        typeof data.won !== 'boolean' ||
        typeof data.guessesUsed !== 'number' ||
        typeof data.durationMs !== 'number'
      ) {
        throw new Error('Invalid finish payload')
      }
      const room = rooms.get(player.roomId)
      if (!room) {
        throw new Error('Room not found')
      }
      room.finishedPlayers.add(socket.id)
      socket.to(player.roomId).emit('opponent:finish', {
        name: player.name,
        won: data.won,
        guessesUsed: data.guessesUsed,
        durationMs: data.durationMs,
      })
      // End the match when a player wins OR all players have finished
      const allFinished = room.players.every((id) => room.finishedPlayers.has(id))
      if (data.won || allFinished) {
        room.state = 'finished'
        log(`room ${player.roomId} state → finished`)
        emitRoomState(player.roomId)
      }
    } catch (err) {
      emitError(socket, errMsg(err, 'game:finish'))
      logError(`game:finish error: ${errMsg(err)}`)
    }
  })

  // ----- presence:update -----
  socket.on('presence:update', (data: PresenceUpdatePayload) => {
    try {
      const player = players.get(socket.id)
      if (!player) {
        throw new Error('Player not identified')
      }
      if (!data || !ALLOWED_STATUSES.includes(data.status)) {
        throw new Error('Invalid status')
      }
      player.status = data.status
      // Global presence broadcast
      io.emit('presence:changed', {
        id: player.id,
        name: player.name,
        status: player.status,
      })
      log(`presence: ${player.name} → ${player.status}`)
    } catch (err) {
      emitError(socket, errMsg(err, 'presence:update'))
      logError(`presence:update error: ${errMsg(err)}`)
    }
  })

  // ----- disconnect -----
  socket.on('disconnect', () => {
    try {
      const player = players.get(socket.id)
      if (!player) {
        log(`disconnected: ${socket.id} (unidentified)`)
        return
      }
      log(`disconnected: ${player.name} (${player.id})`)
      // Remove from any room
      if (player.roomId) {
        const roomId = player.roomId
        // socket.leave is automatic on disconnect, but call for clarity
        socket.leave(roomId)
        removePlayerFromRoom(socket.id, roomId, 'disconnect')
        // Notify remaining room occupants
        io.to(roomId).emit('player:left', { id: player.id, name: player.name })
      }
      // Global presence → offline
      io.emit('presence:changed', {
        id: player.id,
        name: player.name,
        status: 'offline',
      })
      players.delete(socket.id)
    } catch (err) {
      logError(`disconnect error: ${errMsg(err)}`)
    }
  })

  // ----- raw socket error -----
  socket.on('error', (err: Error) => {
    logError(`socket error (${socket.id}):`, err?.message ?? err)
  })
})

// ---------- Error helper ----------

function errMsg(err: unknown, fallback?: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string') return err
  return fallback ?? 'Unknown error'
}

// ---------- Start + graceful shutdown ----------

httpServer.listen(PORT, () => {
  log(`socket.io server running on port ${PORT}`)
})

function shutdown(signal: string): void {
  log(`received ${signal}, shutting down...`)
  io.close(() => {
    log('socket.io engine closed')
    httpServer.close(() => {
      log('http server closed — bye')
      process.exit(0)
    })
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
