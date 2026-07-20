import { createServer } from 'http'
import { Server, type Socket } from 'socket.io'

// ============================================================================
// GLYPH — word-arena socket.io mini-service
// ============================================================================

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
  players: string[]
  hostId: string | null
  state: RoomState
  wordSeed: string | null
  matchStartedAt: number | null
  maxGuesses: number
  finishedPlayers: Set<string>
  // rematch: tracks who has requested a rematch
  rematchRequestedBy: Set<string>
}

interface PlayerPublic {
  id: string
  name: string
  avatarSeed: string
  status: PlayerStatus
}

interface RoomStatePayload {
  id: string
  players: PlayerPublic[]
  hostId: string | null
  state: RoomState
  wordSeed: string | null
  matchStartedAt: number | null
  maxGuesses: number
}

interface ChatMessagePayload {
  id: string
  name: string
  avatarSeed: string
  content: string
  type: ChatType
  ts: number
}

interface PlayerIdentifyPayload { id: string; name: string; avatarSeed: string }
interface RoomCreatePayload { name: string; avatarSeed: string; playerId: string }
interface RoomJoinPayload { roomId: string; name: string; avatarSeed: string; playerId: string }
interface RoomChatPayload { content: string }
interface RoomReactionPayload { emoji: string }
interface GameStartPayload { roomId: string }
interface GameProgressPayload { roomId: string; attempt: number; statuses: TileStatus[]; final: boolean }
interface GameTypingPayload { roomId: string; typing: boolean }
interface GameFinishPayload { roomId: string; won: boolean; guessesUsed: number; durationMs: number }
interface PresenceUpdatePayload { status: PlayerStatus }

const PORT = Number(process.env.PORT || process.env.ARENA_PORT || 3003)
const ROOM_CODE_LENGTH = 6
const MAX_PLAYERS_DUEL = 2
const MAX_CHAT_LENGTH = 200
const MAX_GUESSES = 6
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_ID_REGEX = /^[A-Z0-9]{6}$/
const ALLOWED_EMOJIS = ['🔥', '😂', '😱', '👏', '🤔', '⚡'] as const
const ALLOWED_STATUSES: PlayerStatus[] = ['online', 'idle', 'playing', 'offline']
const VALID_TILE_STATUSES: TileStatus[] = ['correct', 'present', 'absent']
const RECONNECT_GRACE_MS = 30_000
// How long opponent has to respond to rematch request before it auto-expires
const REMATCH_TIMEOUT_MS = 30_000

const players = new Map<string, Player>()
const rooms = new Map<string, Room>()

interface PendingReconnect {
  playerId: string; name: string; avatarSeed: string
  roomId: string; oldSocketId: string
  timer: ReturnType<typeof setTimeout>
}
const pendingReconnects = new Map<string, PendingReconnect>()
const rematchTimers = new Map<string, ReturnType<typeof setTimeout>>() // roomId → timer

const log = (...args: unknown[]) => console.log('[word-arena]', ...args)
const logError = (...args: unknown[]) => console.error('[word-arena]', ...args)

function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  if (rooms.has(code)) return generateRoomCode()
  return code
}

function generateId(): string { return Math.random().toString(36).slice(2, 11) }
function generateWordSeed(): string { return crypto.randomUUID() }
function publicPlayer(p: Player): PlayerPublic {
  return { id: p.id, name: p.name, avatarSeed: p.avatarSeed, status: p.status }
}

function roomStatePayload(room: Room): RoomStatePayload {
  const playerList: PlayerPublic[] = room.players
    .map((sid) => players.get(sid))
    .filter((p): p is Player => !!p)
    .map(publicPlayer)
  return { id: room.id, players: playerList, hostId: room.hostId, state: room.state, wordSeed: room.wordSeed, matchStartedAt: room.matchStartedAt, maxGuesses: room.maxGuesses }
}

function emitRoomState(roomId: string): void {
  const room = rooms.get(roomId)
  if (!room) return
  io.to(roomId).emit('room:state', roomStatePayload(room))
}

function systemMessage(content: string): ChatMessagePayload {
  return { id: generateId(), name: 'System', avatarSeed: 'system', content, type: 'system', ts: Date.now() }
}

function emitError(socket: Socket, message: string): void { socket.emit('error', { message }) }

function removePlayerFromRoom(socketId: string, roomId: string, reason: 'leave' | 'disconnect'): void {
  const room = rooms.get(roomId)
  if (!room) return
  const player = players.get(socketId)
  room.players = room.players.filter((id) => id !== socketId)
  room.finishedPlayers.delete(socketId)
  room.rematchRequestedBy.delete(socketId)
  if (room.hostId === socketId) {
    room.hostId = room.players[0] ?? null
    if (room.hostId) { const newHost = players.get(room.hostId); log(`room ${roomId}: host → ${newHost?.name ?? room.hostId}`) }
  }
  if (room.players.length === 0) { rooms.delete(roomId); log(`room ${roomId} deleted (empty)`); return }
  emitRoomState(roomId)
  if (player) { io.to(roomId).emit('chat:message', systemMessage(`${player.name} ${reason === 'disconnect' ? 'disconnected from' : 'left'} the arena`)) }
}

function errMsg(err: unknown, fallback?: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string') return err
  return fallback ?? 'Unknown error'
}

// ---------- Server ----------

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket: Socket) => {
  log(`connected: ${socket.id}`)

  socket.on('player:identify', (data: PlayerIdentifyPayload, ack?: () => void) => {
    try {
      if (!data || typeof data.id !== 'string' || typeof data.name !== 'string') throw new Error('Invalid identify payload')
      const existing = players.get(socket.id)
      if (existing?.roomId) { socket.leave(existing.roomId); removePlayerFromRoom(socket.id, existing.roomId, 'leave') }
      players.set(socket.id, { id: data.id, name: data.name, avatarSeed: typeof data.avatarSeed === 'string' && data.avatarSeed ? data.avatarSeed : data.id, status: 'online', roomId: null })
      log(`identified: ${data.name} (${data.id})`)
      socket.emit('player:ready', { id: data.id })
      if (typeof ack === 'function') ack()
    } catch (err) { emitError(socket, errMsg(err, 'identify')); logError(`player:identify error: ${errMsg(err)}`) }
  })

  socket.on('room:create', (data: RoomCreatePayload) => {
    try {
      if (!data || typeof data.playerId !== 'string' || typeof data.name !== 'string') throw new Error('Invalid room:create payload')
      const existing = players.get(socket.id)
      if (existing?.roomId) { socket.leave(existing.roomId); removePlayerFromRoom(socket.id, existing.roomId, 'leave') }
      players.set(socket.id, { id: data.playerId, name: data.name, avatarSeed: typeof data.avatarSeed === 'string' && data.avatarSeed ? data.avatarSeed : data.playerId, status: 'online', roomId: null })
      const roomId = generateRoomCode()
      const room: Room = { id: roomId, players: [socket.id], hostId: socket.id, state: 'waiting', wordSeed: null, matchStartedAt: null, maxGuesses: MAX_GUESSES, finishedPlayers: new Set(), rematchRequestedBy: new Set() }
      rooms.set(roomId, room)
      players.get(socket.id)!.roomId = roomId
      socket.join(roomId)
      log(`room created: ${roomId} by ${data.name}`)
      socket.emit('room:created', { roomId })
      emitRoomState(roomId)
    } catch (err) { emitError(socket, errMsg(err, 'room:create')); logError(`room:create error: ${errMsg(err)}`) }
  })

  socket.on('room:join', (data: RoomJoinPayload) => {
    try {
      if (!data || typeof data.roomId !== 'string' || typeof data.playerId !== 'string' || typeof data.name !== 'string') throw new Error('Invalid room:join payload')
      if (!ROOM_ID_REGEX.test(data.roomId)) throw new Error('Invalid room ID format')
      const room = rooms.get(data.roomId)
      if (!room) throw new Error('Room not found')
      if (room.players.includes(socket.id)) {
        const playerList = room.players.map((sid) => players.get(sid)).filter((p): p is Player => !!p).map(publicPlayer)
        socket.emit('room:joined', { roomId: data.roomId, players: playerList }); emitRoomState(data.roomId); return
      }
      if (room.players.length >= MAX_PLAYERS_DUEL) throw new Error('Room is full')
      const existing = players.get(socket.id)
      if (existing?.roomId && existing.roomId !== data.roomId) { socket.leave(existing.roomId); removePlayerFromRoom(socket.id, existing.roomId, 'leave') }
      players.set(socket.id, { id: data.playerId, name: data.name, avatarSeed: typeof data.avatarSeed === 'string' && data.avatarSeed ? data.avatarSeed : data.playerId, status: 'online', roomId: data.roomId })
      room.players.push(socket.id)
      socket.join(data.roomId)
      log(`${data.name} joined room ${data.roomId}`)
      const playerList = room.players.map((sid) => players.get(sid)).filter((p): p is Player => !!p).map(publicPlayer)
      socket.emit('room:joined', { roomId: data.roomId, players: playerList })
      emitRoomState(data.roomId)
      io.to(data.roomId).emit('chat:message', systemMessage(`${data.name} entered the arena`))
    } catch (err) { emitError(socket, errMsg(err, 'room:join')); logError(`room:join error: ${errMsg(err)}`) }
  })

  socket.on('room:leave', () => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) throw new Error('Not in a room')
      const roomId = player.roomId
      socket.leave(roomId); removePlayerFromRoom(socket.id, roomId, 'leave'); player.roomId = null
      log(`${player.name} left room ${roomId}`)
    } catch (err) { emitError(socket, errMsg(err, 'room:leave')); logError(`room:leave error: ${errMsg(err)}`) }
  })

  socket.on('room:chat', (data: RoomChatPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) throw new Error('Not in a room')
      if (!data || typeof data.content !== 'string') throw new Error('Invalid chat payload')
      const content = data.content.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH)
      if (!content) throw new Error('Empty message')
      const message: ChatMessagePayload = { id: generateId(), name: player.name, avatarSeed: player.avatarSeed, content, type: 'user', ts: Date.now() }
      io.to(player.roomId).emit('chat:message', message)
    } catch (err) { emitError(socket, errMsg(err, 'room:chat')); logError(`room:chat error: ${errMsg(err)}`) }
  })

  socket.on('room:reaction', (data: RoomReactionPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) throw new Error('Not in a room')
      if (!data || typeof data.emoji !== 'string') throw new Error('Invalid reaction payload')
      if (!ALLOWED_EMOJIS.includes(data.emoji as (typeof ALLOWED_EMOJIS)[number])) throw new Error('Emoji not allowed')
      io.to(player.roomId).emit('room:reaction', { name: player.name, avatarSeed: player.avatarSeed, emoji: data.emoji, ts: Date.now() })
    } catch (err) { emitError(socket, errMsg(err, 'room:reaction')); logError(`room:reaction error: ${errMsg(err)}`) }
  })

  // ----- duel:invite -----
  // One player sends a duel invite to another (by their app player ID).
  // The target gets duel:invited with the room code so they can join directly.
  socket.on('duel:invite', (data: { targetPlayerId: string; roomCode: string }) => {
    try {
      const player = players.get(socket.id)
      if (!player) throw new Error('Not identified')
      if (!data || typeof data.targetPlayerId !== 'string' || typeof data.roomCode !== 'string') throw new Error('Invalid payload')
      // Find target socket by app player ID
      let targetSocketId: string | null = null
      for (const [sid, p] of players.entries()) {
        if (p.id === data.targetPlayerId) { targetSocketId = sid; break }
      }
      if (!targetSocketId) {
        socket.emit('duel:invite-failed', { reason: 'Friend is not online' })
        return
      }
      io.to(targetSocketId).emit('duel:invited', {
        from: player.name,
        avatarSeed: player.avatarSeed,
        roomCode: data.roomCode,
      })
      log(`${player.name} invited ${data.targetPlayerId} to room ${data.roomCode}`)
    } catch (err) { emitError(socket, errMsg(err, 'duel:invite')); logError(`duel:invite error: ${errMsg(err)}`) }
  })

  socket.on('game:start', (data: GameStartPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player) throw new Error('Player not identified')
      const roomId = (data && typeof data.roomId === 'string' && data.roomId) || player.roomId
      if (!roomId) throw new Error('Not in a room')
      const room = rooms.get(roomId)
      if (!room) throw new Error('Room not found')
      if (room.hostId !== socket.id) throw new Error('Only the host can start the game')
      if (room.players.length < 1) throw new Error('Not enough players')
      room.wordSeed = generateWordSeed(); room.matchStartedAt = Date.now(); room.state = 'playing'; room.finishedPlayers.clear(); room.rematchRequestedBy.clear()
      log(`game started in room ${roomId} (seed: ${room.wordSeed})`)
      io.to(roomId).emit('game:started', { wordSeed: room.wordSeed, matchStartedAt: room.matchStartedAt, maxGuesses: room.maxGuesses })
      emitRoomState(roomId)
    } catch (err) { emitError(socket, errMsg(err, 'game:start')); logError(`game:start error: ${errMsg(err)}`) }
  })

  // ----- rematch:request -----
  // Sender asks opponent for a rematch. Opponent gets rematch:incoming event.
  socket.on('rematch:request', () => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) throw new Error('Not in a room')
      const room = rooms.get(player.roomId)
      if (!room) throw new Error('Room not found')
      if (room.state !== 'finished' && room.state !== 'playing') throw new Error('Match not finished yet')

      room.rematchRequestedBy.add(socket.id)
      log(`${player.name} requested rematch in room ${player.roomId}`)

      // Notify opponent
      socket.to(player.roomId).emit('rematch:incoming', { from: player.name, avatarSeed: player.avatarSeed })
      io.to(player.roomId).emit('chat:message', systemMessage(`${player.name} wants a rematch!`))

      // Auto-expire if opponent doesn't respond in 30s
      const existingTimer = rematchTimers.get(player.roomId)
      if (existingTimer) clearTimeout(existingTimer)
      const timer = setTimeout(() => {
        rematchTimers.delete(player.roomId!)
        room.rematchRequestedBy.delete(socket.id)
        socket.emit('rematch:expired')
        io.to(player.roomId!).emit('chat:message', systemMessage('Rematch request expired.'))
        log(`rematch expired in room ${player.roomId}`)
      }, REMATCH_TIMEOUT_MS)
      rematchTimers.set(player.roomId, timer)
    } catch (err) { emitError(socket, errMsg(err, 'rematch:request')); logError(`rematch:request error: ${errMsg(err)}`) }
  })

  // ----- rematch:accept -----
  // Opponent accepts — both players get rematch:start with a fresh word seed.
  socket.on('rematch:accept', () => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) throw new Error('Not in a room')
      const room = rooms.get(player.roomId)
      if (!room) throw new Error('Room not found')
      if (room.rematchRequestedBy.size === 0) throw new Error('No pending rematch request')

      // Cancel timer
      const timer = rematchTimers.get(player.roomId)
      if (timer) { clearTimeout(timer); rematchTimers.delete(player.roomId) }

      // Start fresh match
      room.wordSeed = generateWordSeed()
      room.matchStartedAt = Date.now()
      room.state = 'playing'
      room.finishedPlayers.clear()
      room.rematchRequestedBy.clear()

      log(`rematch accepted in room ${player.roomId} — new seed: ${room.wordSeed}`)
      io.to(player.roomId).emit('rematch:start', { wordSeed: room.wordSeed, matchStartedAt: room.matchStartedAt, maxGuesses: room.maxGuesses })
      io.to(player.roomId).emit('chat:message', systemMessage('Rematch! Same room, new word. Good luck.'))
      emitRoomState(player.roomId)
    } catch (err) { emitError(socket, errMsg(err, 'rematch:accept')); logError(`rematch:accept error: ${errMsg(err)}`) }
  })

  // ----- rematch:reject -----
  // Opponent declines — sender gets notified, room stays open.
  socket.on('rematch:reject', () => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) throw new Error('Not in a room')
      const room = rooms.get(player.roomId)
      if (!room) throw new Error('Room not found')

      const timer = rematchTimers.get(player.roomId)
      if (timer) { clearTimeout(timer); rematchTimers.delete(player.roomId) }
      room.rematchRequestedBy.clear()

      log(`${player.name} rejected rematch in room ${player.roomId}`)
      socket.to(player.roomId).emit('rematch:rejected', { by: player.name })
      io.to(player.roomId).emit('chat:message', systemMessage(`${player.name} declined the rematch.`))
    } catch (err) { emitError(socket, errMsg(err, 'rematch:reject')); logError(`rematch:reject error: ${errMsg(err)}`) }
  })

  socket.on('game:progress', (data: GameProgressPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) throw new Error('Not in a room')
      if (!data || typeof data.attempt !== 'number' || !Array.isArray(data.statuses)) throw new Error('Invalid progress payload')
      for (const s of data.statuses) { if (!VALID_TILE_STATUSES.includes(s)) throw new Error('Invalid tile status') }
      socket.to(player.roomId).emit('opponent:progress', { name: player.name, avatarSeed: player.avatarSeed, attempt: data.attempt, statuses: data.statuses, final: !!data.final })
    } catch (err) { emitError(socket, errMsg(err, 'game:progress')); logError(`game:progress error: ${errMsg(err)}`) }
  })

  socket.on('game:typing', (data: GameTypingPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) throw new Error('Not in a room')
      socket.to(player.roomId).emit('opponent:typing', { name: player.name, typing: !!(data && data.typing) })
    } catch (err) { emitError(socket, errMsg(err, 'game:typing')); logError(`game:typing error: ${errMsg(err)}`) }
  })

  socket.on('game:finish', (data: GameFinishPayload) => {
    try {
      const player = players.get(socket.id)
      if (!player || !player.roomId) throw new Error('Not in a room')
      if (!data || typeof data.won !== 'boolean' || typeof data.guessesUsed !== 'number' || typeof data.durationMs !== 'number') throw new Error('Invalid finish payload')
      const room = rooms.get(player.roomId)
      if (!room) throw new Error('Room not found')
      room.finishedPlayers.add(socket.id)
      socket.to(player.roomId).emit('opponent:finish', { name: player.name, won: data.won, guessesUsed: data.guessesUsed, durationMs: data.durationMs })
      const allFinished = room.players.every((id) => room.finishedPlayers.has(id))
      if (data.won || allFinished) { room.state = 'finished'; log(`room ${player.roomId} → finished`); emitRoomState(player.roomId) }
    } catch (err) { emitError(socket, errMsg(err, 'game:finish')); logError(`game:finish error: ${errMsg(err)}`) }
  })

  socket.on('presence:update', (data: PresenceUpdatePayload) => {
    try {
      const player = players.get(socket.id)
      if (!player) throw new Error('Player not identified')
      if (!data || !ALLOWED_STATUSES.includes(data.status)) throw new Error('Invalid status')
      player.status = data.status
      io.emit('presence:changed', { id: player.id, name: player.name, status: player.status })
    } catch (err) { emitError(socket, errMsg(err, 'presence:update')); logError(`presence:update error: ${errMsg(err)}`) }
  })

  socket.on('room:rejoin', (data: { roomId?: string; playerId?: string }) => {
    try {
      if (!data || typeof data.roomId !== 'string' || typeof data.playerId !== 'string') throw new Error('Invalid room:rejoin payload')
      const pending = pendingReconnects.get(data.playerId)
      const room = rooms.get(data.roomId)
      if (!pending || pending.roomId !== data.roomId || !room) { socket.emit('room:rejoin-failed', { roomId: data.roomId }); return }
      clearTimeout(pending.timer); pendingReconnects.delete(data.playerId)
      room.players = room.players.map((id) => (id === pending.oldSocketId ? socket.id : id))
      if (room.hostId === pending.oldSocketId) room.hostId = socket.id
      if (room.finishedPlayers.has(pending.oldSocketId)) { room.finishedPlayers.delete(pending.oldSocketId); room.finishedPlayers.add(socket.id) }
      players.delete(pending.oldSocketId)
      players.set(socket.id, { id: pending.playerId, name: pending.name, avatarSeed: pending.avatarSeed, status: 'playing', roomId: data.roomId })
      socket.join(data.roomId)
      socket.emit('room:rejoined', { roomId: data.roomId })
      io.to(data.roomId).emit('player:reconnected', { id: pending.playerId, name: pending.name })
      emitRoomState(data.roomId)
      log(`rejoined: ${pending.name} back in room ${data.roomId}`)
    } catch (err) { emitError(socket, errMsg(err, 'room:rejoin')); logError(`room:rejoin error: ${errMsg(err)}`) }
  })

  socket.on('disconnect', () => {
    try {
      const player = players.get(socket.id)
      if (!player) { log(`disconnected: ${socket.id} (unidentified)`); return }
      log(`disconnected: ${player.name} (${player.id})`)
      if (player.roomId) {
        const roomId = player.roomId
        const room = rooms.get(roomId)
        socket.leave(roomId)
        if (room && room.state === 'playing') {
          const pending: PendingReconnect = {
            playerId: player.id, name: player.name, avatarSeed: player.avatarSeed, roomId, oldSocketId: socket.id,
            timer: setTimeout(() => {
              pendingReconnects.delete(player.id)
              removePlayerFromRoom(socket.id, roomId, 'disconnect')
              io.to(roomId).emit('player:left', { id: player.id, name: player.name })
              io.to(roomId).emit('duel:opponent-forfeit', { id: player.id, name: player.name })
              log(`grace expired: ${player.name} forfeits room ${roomId}`)
            }, RECONNECT_GRACE_MS),
          }
          pendingReconnects.set(player.id, pending)
          io.to(roomId).emit('player:disconnected', { id: player.id, name: player.name, graceMs: RECONNECT_GRACE_MS })
        } else {
          removePlayerFromRoom(socket.id, roomId, 'disconnect')
          io.to(roomId).emit('player:left', { id: player.id, name: player.name })
        }
      }
      io.emit('presence:changed', { id: player.id, name: player.name, status: 'offline' })
      players.delete(socket.id)
    } catch (err) { logError(`disconnect error: ${errMsg(err)}`) }
  })

  socket.on('error', (err: Error) => { logError(`socket error (${socket.id}):`, err?.message ?? err) })
})

function errMsg(err: unknown, fallback?: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string') return err
  return fallback ?? 'Unknown error'
}

httpServer.listen(PORT, () => { log(`socket.io server running on port ${PORT}`) })

function shutdown(signal: string): void {
  log(`received ${signal}, shutting down...`)
  io.close(() => { log('socket.io engine closed'); httpServer.close(() => { log('http server closed — bye'); process.exit(0) }) })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
