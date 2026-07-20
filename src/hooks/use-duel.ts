"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { OpponentState, TileStatus } from "@/lib/types";
import { api } from "@/lib/api";

export type DuelPhase = "lobby" | "waiting" | "playing" | "finished";

export interface ChatMessage {
  id: string;
  name: string;
  avatarSeed: string;
  content: string;
  type: "user" | "system";
  ts: number;
}

export interface Reaction {
  id: string;
  name: string;
  avatarSeed: string;
  emoji: string;
  ts: number;
}

interface UseDuelOptions {
  player: { id: string; username: string; avatarSeed: string } | null;
}

interface DuelState {
  phase: DuelPhase;
  mode: "bot" | "online" | null;
  roomCode: string | null;
  duelSeed: string | null;
  matchStartedAt: number | null;
  maxGuesses: number;
  opponent: OpponentState | null;
  messages: ChatMessage[];
  reactions: Reaction[];
  presenceError: string | null;
  opponentGraceUntil: number | null;
  opponentForfeited: boolean;
  isHost: boolean;
}

const BOT_NAMES = [
  { name: "NeonCipher", seed: "NeonCipher" },
  { name: "QuantumFox", seed: "QuantumFox" },
  { name: "CyberRaven", seed: "CyberRaven" },
  { name: "SolarDrake", seed: "SolarDrake" },
  { name: "LunarWolf", seed: "LunarWolf" },
  { name: "CosmicFalcon", seed: "CosmicFalcon" },
];

function genWordSeed(): string {
  return "duel-" + Math.random().toString(36).slice(2, 10);
}

function botGuessPattern(
  attempt: number,
  targetGuesses: number,
  willSolve: boolean,
  correctSoFar: number
): { statuses: TileStatus[]; correctCount: number } {
  const statuses: TileStatus[] = [];
  let correct = correctSoFar;
  if ((willSolve && attempt >= targetGuesses) || (willSolve && attempt === 6)) {
    return { statuses: Array(5).fill("correct"), correctCount: 5 };
  }
  const gain = attempt === 1 ? 0 : Math.floor(Math.random() * 3);
  correct = Math.min(5, correct + gain);
  for (let i = 0; i < 5; i++) {
    if (i < correct) statuses.push("correct");
    else statuses.push(Math.random() < 0.3 ? "present" : "absent");
  }
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }
  const greenCount = statuses.filter((s) => s === "correct").length;
  if (greenCount < correct) {
    let need = correct - greenCount;
    for (let i = 0; i < statuses.length && need > 0; i++) {
      if (statuses[i] !== "correct") { statuses[i] = "correct"; need--; }
    }
  } else if (greenCount > correct) {
    correct = greenCount;
  }
  return { statuses, correctCount: correct };
}

function systemMsg(content: string): ChatMessage {
  return { id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "System", avatarSeed: "system", content, type: "system", ts: Date.now() };
}

// --- duel session persistence ---
const DUEL_SESSION_KEY = "glyph-duel-session";
interface DuelSessionSnapshot { roomId: string; playerId: string; savedAt: number; }
function saveDuelSession(snap: Omit<DuelSessionSnapshot, "savedAt">): void {
  try { sessionStorage.setItem(DUEL_SESSION_KEY, JSON.stringify({ ...snap, savedAt: Date.now() })); } catch { /**/ }
}
function loadDuelSession(): DuelSessionSnapshot | null {
  try {
    const raw = sessionStorage.getItem(DUEL_SESSION_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as DuelSessionSnapshot;
    if (Date.now() - snap.savedAt > 60_000) { clearDuelSession(); return null; }
    return snap;
  } catch { return null; }
}
function clearDuelSession(): void {
  try { sessionStorage.removeItem(DUEL_SESSION_KEY); } catch { /**/ }
}

const initialState: DuelState = {
  phase: "lobby", mode: null, roomCode: null, duelSeed: null,
  matchStartedAt: null, maxGuesses: 6, opponent: null, messages: [],
  reactions: [], presenceError: null, opponentGraceUntil: null,
  opponentForfeited: false, isHost: false,
};

export function useDuel({ player }: UseDuelOptions) {
  const [state, setState] = useState<DuelState>(initialState);

  const socketRef = useRef<Socket | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const identifiedRef = useRef(false);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botStateRef = useRef<{
    attempt: number; correctSoFar: number; targetGuesses: number;
    willSolve: boolean; name: string; seed: string;
  } | null>(null);

  useEffect(() => {
    roomCodeRef.current = state.roomCode;
    if (state.phase === "playing" && state.mode === "online" && state.roomCode && player) {
      saveDuelSession({ roomId: state.roomCode, playerId: player.id });
      const t = setInterval(() => saveDuelSession({ roomId: state.roomCode!, playerId: player.id }), 15_000);
      return () => clearInterval(t);
    }
  }, [state.phase, state.mode, state.roomCode, player]);

  const pushMessage = useCallback((m: ChatMessage) => {
    setState((s) => ({ ...s, messages: [...s.messages, m].slice(-50) }));
  }, []);

  const pushReaction = useCallback((r: Reaction) => {
    setState((s) => ({ ...s, reactions: [...s.reactions, r].slice(-8) }));
    setTimeout(() => setState((s) => ({ ...s, reactions: s.reactions.filter((x) => x.id !== r.id) })), 4000);
  }, []);

  // stable refs so ensureSocket never re-creates the socket due to stale deps
  const pushMessageRef = useRef(pushMessage);
  const pushReactionRef = useRef(pushReaction);
  const playerRef = useRef(player);
  useEffect(() => {
    pushMessageRef.current = pushMessage;
    pushReactionRef.current = pushReaction;
    playerRef.current = player;
  });

  const ensureSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const url = process.env.NEXT_PUBLIC_ARENA_URL || "http://localhost:3003";
    const sock = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    sock.on("connect_error", () => {
      setState((s) => ({ ...s, presenceError: "Realtime service unavailable. Bot mode still works." }));
    });
    sock.on("connect", () => {
      identifiedRef.current = false;
      const p = playerRef.current;
      if (p) {
        sock.emit("player:identify", { id: p.id, name: p.username, avatarSeed: p.avatarSeed }, () => {
          identifiedRef.current = true;
          const saved = loadDuelSession();
          if (saved && saved.playerId === p.id) {
            sock.emit("room:rejoin", { roomId: saved.roomId, playerId: p.id });
          }
        });
      }
    });
    sock.on("chat:message", (m: ChatMessage) => pushMessageRef.current(m));
    sock.on("room:reaction", (r: Reaction) => pushReactionRef.current(r));
    sock.on("player:disconnected", (p: { id: string; name: string; graceMs: number }) => {
      setState((s) => ({ ...s, opponentGraceUntil: Date.now() + p.graceMs }));
      pushMessageRef.current(systemMsg(`${p.name} disconnected — waiting ${Math.round(p.graceMs / 1000)}s…`));
    });
    sock.on("player:reconnected", (p: { id: string; name: string }) => {
      setState((s) => ({ ...s, opponentGraceUntil: null }));
      pushMessageRef.current(systemMsg(`${p.name} reconnected`));
    });
    sock.on("duel:opponent-forfeit", (p: { id: string; name: string }) => {
      setState((s) => ({
        ...s, opponentGraceUntil: null, opponentForfeited: true,
        opponent: s.opponent ? { ...s.opponent, lost: true } : s.opponent,
      }));
      pushMessageRef.current(systemMsg(`${p.name} abandoned the match — you win!`));
    });
    sock.on("room:rejoined", () => pushMessageRef.current(systemMsg("Reconnected to the match")));
    sock.on("room:rejoin-failed", () => clearDuelSession());
    sock.on("room:joined", ({ roomId }: { roomId: string }) => {
      setState((s) => s.isHost ? s : ({ ...s, roomCode: roomId, phase: "waiting", mode: "online", isHost: false }));
    });
    sock.on("error", ({ message }: { message: string }) => {
      setState((s) => ({ ...s, presenceError: message, phase: "lobby", roomCode: null }));
      pushMessageRef.current(systemMsg(`Error: ${message}`));
    });
    sock.on("room:created", ({ roomId }: { roomId: string }) => {
      setState((s) => ({ ...s, roomCode: roomId, isHost: true }));
      // BUG FIX #7: use ref version, not stale closure
      pushMessageRef.current({ id: Math.random().toString(36).slice(2), name: "System", avatarSeed: "glyph", content: `Room ${roomId} created. Share this code with a friend.`, type: "system", ts: Date.now() });
    });
    sock.on("room:state", (rs: { id: string; players: Array<{ id: string; name: string; avatarSeed: string }>; state: string }) => {
      // DEFINITIVE FIX: filter out ourselves using BOTH app ID and username as fallbacks.
      // The server stores Player.id = data.playerId (the app's player ID from DB/cookie).
      // We match on id first, then username as a safety net in case IDs are mismatched.
      const myAppId = playerRef.current?.id;
      const myName = playerRef.current?.username;
      const others = rs.players.filter((p) => {
        if (myAppId && p.id === myAppId) return false;  // matched by app ID — it's us
        if (myName && p.name === myName) return false;  // matched by name — it's us
        return true;
      });
      if (others.length > 0) {
        const o = others[0];
        setState((s) => ({
          ...s,
          opponent: s.opponent
            ? { ...s.opponent, name: o.name, avatarSeed: o.avatarSeed }
            : { id: o.id, name: o.name, avatarSeed: o.avatarSeed, status: "playing", rows: [], currentAttempt: 0, won: false, lost: false, typing: false },
        }));
      }
    });
    sock.on("game:started", async (payload: { wordSeed: string; matchStartedAt: number; maxGuesses: number }) => {
      if (playerRef.current) {
        const rc = roomCodeRef.current;
        if (rc) saveDuelSession({ roomId: rc, playerId: playerRef.current!.id });
      }
      try {
        const session = await api<{ token: string; maxGuesses: number }>("/api/words/duel", {
          method: "POST",
          body: JSON.stringify({ wordSeed: payload.wordSeed }),
        });
        setState((s) => ({
          ...s, phase: "playing", duelSeed: session.token,
          matchStartedAt: payload.matchStartedAt, maxGuesses: payload.maxGuesses,
          opponent: s.opponent ? { ...s.opponent, rows: [], currentAttempt: 0, won: false, lost: false, typing: false } : s.opponent,
        }));
        // BUG FIX #7: use ref
        pushMessageRef.current({ id: Math.random().toString(36).slice(2), name: "System", avatarSeed: "glyph", content: "Match started. Same word. Good luck.", type: "system", ts: Date.now() });
      } catch {
        setState((s) => ({ ...s, presenceError: "Failed to start duel." }));
      }
    });
    sock.on("opponent:progress", (p: { name: string; avatarSeed: string; attempt: number; statuses: TileStatus[]; final: boolean }) => {
      setState((s) => {
        if (!s.opponent) return s;
        const rows = [...s.opponent.rows];
        rows[p.attempt - 1] = { statuses: p.statuses, final: p.final };
        return { ...s, opponent: { ...s.opponent, rows, currentAttempt: p.attempt, typing: false } };
      });
    });
    sock.on("opponent:typing", (t: { name: string; typing: boolean }) => {
      setState((s) => (s.opponent ? { ...s, opponent: { ...s.opponent, typing: t.typing } } : s));
    });
    sock.on("opponent:finish", (f: { name: string; won: boolean; guessesUsed: number; durationMs: number }) => {
      setState((s) =>
        s.opponent
          ? { ...s, opponent: { ...s.opponent, won: f.won, lost: !f.won, finishedAt: Date.now(), finishTimeMs: f.durationMs } }
          : s
      );
    });
    socketRef.current = sock;
    return sock;
  }, []);

  // ---- Bot mode ----
  const startBotLoop = useCallback(() => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    const bot = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const targetGuesses = 3 + Math.floor(Math.random() * 4);
    const willSolve = Math.random() < 0.72;
    botStateRef.current = { attempt: 0, correctSoFar: 0, targetGuesses, willSolve, name: bot.name, seed: bot.seed };

    setState((s) => ({
      ...s,
      opponent: { id: "bot", name: bot.name, avatarSeed: bot.seed, status: "playing", rows: [], currentAttempt: 0, won: false, lost: false, typing: false },
    }));

    const tick = () => {
      const bs = botStateRef.current;
      if (!bs) return;
      bs.attempt += 1;
      const isSolving = bs.willSolve && bs.attempt >= bs.targetGuesses;
      const { statuses, correctCount } = isSolving
        ? { statuses: Array(5).fill("correct") as TileStatus[], correctCount: 5 }
        : botGuessPattern(bs.attempt, bs.targetGuesses, bs.willSolve, bs.correctSoFar);
      bs.correctSoFar = correctCount;

      setState((s) => {
        if (!s.opponent) return s;
        const rows = [...s.opponent.rows];
        rows[bs.attempt - 1] = { statuses, final: true };
        const won = isSolving;
        const lost = !bs.willSolve && bs.attempt >= 6;
        return {
          ...s,
          opponent: { ...s.opponent, rows, currentAttempt: bs.attempt, won, lost, finishedAt: won || lost ? Date.now() : undefined, finishTimeMs: won || lost ? Date.now() - (s.matchStartedAt ?? Date.now()) : undefined, typing: !(won || lost) },
        };
      });

      const done = isSolving || (!bs.willSolve && bs.attempt >= 6);
      if (!done) {
        setState((s) => (s.opponent ? { ...s, opponent: { ...s.opponent, typing: true } } : s));
        botTimerRef.current = setTimeout(tick, 3200 + Math.random() * 3200);
      } else {
        botTimerRef.current = setTimeout(() => {
          pushMessage({ id: Math.random().toString(36).slice(2), name: "System", avatarSeed: "glyph", content: `${bot.name} ${isSolving ? "decoded the grid" : "ran out of guesses"}.`, type: "system", ts: Date.now() });
        }, 600);
      }
    };

    setState((s) => (s.opponent ? { ...s, opponent: { ...s.opponent, typing: true } } : s));
    botTimerRef.current = setTimeout(tick, 2400 + Math.random() * 2000);
  }, [pushMessage]);

  const quickMatch = useCallback(async () => {
    if (!player) return;
    const wordSeed = genWordSeed();
    try {
      const session = await api<{ token: string; maxGuesses: number }>("/api/words/duel", {
        method: "POST",
        body: JSON.stringify({ wordSeed }),
      });
      setState((s) => ({
        ...s, phase: "playing", mode: "bot", roomCode: null,
        duelSeed: session.token, matchStartedAt: Date.now(),
        maxGuesses: session.maxGuesses, messages: [], reactions: [],
        presenceError: null, opponentForfeited: false, opponentGraceUntil: null,
        opponent: null, isHost: false,
      }));
      pushMessage({ id: Math.random().toString(36).slice(2), name: "System", avatarSeed: "glyph", content: "Quick match started. Opponent inbound…", type: "system", ts: Date.now() });
      startBotLoop();
    } catch {
      setState((s) => ({ ...s, presenceError: "Failed to start quick match." }));
    }
  }, [player, pushMessage, startBotLoop]);

  // ---- Online mode ----
  const createRoom = useCallback(async () => {
    if (!player) return;
    const sock = ensureSocket();
    setState((s) => ({ ...s, phase: "waiting", mode: "online", roomCode: null, messages: [], reactions: [], presenceError: null }));
    const doCreate = () => sock.emit("room:create", { name: player.username, avatarSeed: player.avatarSeed, playerId: player.id });
    if (identifiedRef.current) {
      doCreate();
    } else {
      sock.emit("player:identify", { id: player.id, name: player.username, avatarSeed: player.avatarSeed }, () => {
        identifiedRef.current = true;
        doCreate();
      });
    }
  }, [player, ensureSocket]);

  const joinRoom = useCallback(async (code: string) => {
    if (!player) return;
    const sock = ensureSocket();
    setState((s) => ({ ...s, phase: "waiting", mode: "online", roomCode: null, messages: [], reactions: [], presenceError: null }));
    const doJoin = () => sock.emit("room:join", { roomId: code.toUpperCase(), name: player.username, avatarSeed: player.avatarSeed, playerId: player.id });
    if (identifiedRef.current) {
      doJoin();
    } else {
      sock.emit("player:identify", { id: player.id, name: player.username, avatarSeed: player.avatarSeed }, () => {
        identifiedRef.current = true;
        doJoin();
      });
    }
    pushMessage({ id: Math.random().toString(36).slice(2), name: "System", avatarSeed: "glyph", content: `Joining room ${code.toUpperCase()}…`, type: "system", ts: Date.now() });
  }, [player, ensureSocket, pushMessage]);

  const startOnlineMatch = useCallback(() => {
    // BUG FIX #3: only host can start
    if (!state.roomCode || !state.isHost) return;
    const sock = socketRef.current;
    if (!sock) return;
    sock.emit("game:start", { roomId: state.roomCode });
  }, [state.roomCode, state.isHost]);

  const sendChat = useCallback((content: string) => {
    if (!player || !content.trim()) return;
    const sock = socketRef.current;
    if (sock && state.mode === "online" && state.roomCode) {
      sock.emit("room:chat", { content: content.trim().slice(0, 200) });
    } else {
      pushMessage({ id: Math.random().toString(36).slice(2), name: player.username, avatarSeed: player.avatarSeed, content: content.trim().slice(0, 200), type: "user", ts: Date.now() });
    }
  }, [player, state.mode, state.roomCode, pushMessage]);

  const sendReaction = useCallback((emoji: string) => {
    const sock = socketRef.current;
    if (sock && state.mode === "online" && state.roomCode) {
      sock.emit("room:reaction", { emoji });
    } else if (player) {
      pushReaction({ id: Math.random().toString(36).slice(2), name: player.username, avatarSeed: player.avatarSeed, emoji, ts: Date.now() });
    }
  }, [state.mode, state.roomCode, player, pushReaction]);

  const reportMyProgress = useCallback((statuses: TileStatus[], attempt: number, final: boolean) => {
    const sock = socketRef.current;
    if (sock && state.mode === "online" && state.roomCode) {
      sock.emit("game:progress", { roomId: state.roomCode, attempt, statuses, final });
    }
  }, [state.mode, state.roomCode]);

  const reportMyTyping = useCallback((typing: boolean) => {
    const sock = socketRef.current;
    if (sock && state.mode === "online" && state.roomCode) {
      sock.emit("game:typing", { roomId: state.roomCode, typing });
    }
  }, [state.mode, state.roomCode]);

  const reportMyFinish = useCallback((won: boolean, guessesUsed: number, durationMs: number) => {
    const sock = socketRef.current;
    if (sock && state.mode === "online" && state.roomCode) {
      sock.emit("game:finish", { roomId: state.roomCode, won, guessesUsed, durationMs });
      clearDuelSession();
    }
  }, [state.mode, state.roomCode]);

  const reset = useCallback(() => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    botStateRef.current = null;
    const sock = socketRef.current;
    if (sock && state.roomCode) {
      sock.emit("room:leave");
      clearDuelSession();
    }
    // BUG FIX #6: reset identifiedRef on reset so createRoom/joinRoom re-identifies
    identifiedRef.current = false;
    setState(initialState);
  }, [state.roomCode]);

  useEffect(() => {
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    ...state,
    quickMatch,
    createRoom,
    joinRoom,
    startOnlineMatch,
    sendChat,
    sendReaction,
    reportMyProgress,
    reportMyTyping,
    reportMyFinish,
    reset,
  };
}