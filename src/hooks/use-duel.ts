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

function genRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Generate a plausible color pattern for a bot guess. */
function botGuessPattern(
  attempt: number,
  targetGuesses: number,
  willSolve: boolean,
  correctSoFar: number
): { statuses: TileStatus[]; correctCount: number } {
  const statuses: TileStatus[] = [];
  let correct = correctSoFar;
  // final solving guess
  if ((willSolve && attempt >= targetGuesses) || (willSolve && attempt === 6)) {
    return { statuses: Array(5).fill("correct"), correctCount: 5 };
  }
  // increment correct count progressively
  const gain = attempt === 1 ? 0 : Math.floor(Math.random() * 3); // 0-2 new greens
  correct = Math.min(5, correct + gain);
  for (let i = 0; i < 5; i++) {
    if (i < correct) statuses.push("correct");
    else {
      // some present, some absent
      statuses.push(Math.random() < 0.3 ? "present" : "absent");
    }
  }
  // shuffle a bit so greens aren't always at the start
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }
  // but keep at least `correct` greens
  const greenCount = statuses.filter((s) => s === "correct").length;
  if (greenCount < correct) {
    let need = correct - greenCount;
    for (let i = 0; i < statuses.length && need > 0; i++) {
      if (statuses[i] !== "correct") {
        statuses[i] = "correct";
        need--;
      }
    }
  } else if (greenCount > correct) {
    correct = greenCount;
  }
  return { statuses, correctCount: correct };
}

export function useDuel({ player }: UseDuelOptions) {
  const [state, setState] = useState<DuelState>({
    phase: "lobby",
    mode: null,
    roomCode: null,
    duelSeed: null,
    matchStartedAt: null,
    maxGuesses: 6,
    opponent: null,
    messages: [],
    reactions: [],
    presenceError: null,
  });

  const socketRef = useRef<Socket | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botStateRef = useRef<{
    attempt: number;
    correctSoFar: number;
    targetGuesses: number;
    willSolve: boolean;
    name: string;
    seed: string;
  } | null>(null);

  const pushMessage = useCallback((m: ChatMessage) => {
    setState((s) => ({ ...s, messages: [...s.messages, m].slice(-50) }));
  }, []);

  const pushReaction = useCallback((r: Reaction) => {
    setState((s) => ({ ...s, reactions: [...s.reactions, r].slice(-8) }));
    setTimeout(() => {
      setState((s) => ({ ...s, reactions: s.reactions.filter((x) => x.id !== r.id) }));
    }, 4000);
  }, []);

  const ensureSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const sock = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    sock.on("connect_error", () => {
      setState((s) => ({ ...s, presenceError: "Realtime service unavailable. Bot mode still works." }));
    });
    sock.on("connect", () => {
      if (player) {
        sock.emit("player:identify", {
          id: player.id,
          name: player.username,
          avatarSeed: player.avatarSeed,
        });
      }
    });
    sock.on("chat:message", (m: ChatMessage) => pushMessage(m));
    sock.on("room:reaction", (r: Reaction) => pushReaction(r));
    sock.on("room:state", (rs: { id: string; players: Array<{ id: string; name: string; avatarSeed: string }>; state: string }) => {
      const others = rs.players.filter((p) => p.id !== socketRef.current?.id);
      if (others.length > 0) {
        const o = others[0];
        setState((s) => ({
          ...s,
          opponent: s.opponent
            ? { ...s.opponent, name: o.name, avatarSeed: o.avatarSeed }
            : {
                id: o.id,
                name: o.name,
                avatarSeed: o.avatarSeed,
                status: "playing",
                rows: [],
                currentAttempt: 0,
                won: false,
                lost: false,
                typing: false,
              },
        }));
      }
    });
    sock.on("game:started", async (payload: { wordSeed: string; matchStartedAt: number; maxGuesses: number }) => {
      // fetch the shared duel word session
      try {
        const sess = await api<{ seed: string; maxGuesses: number }>("/api/words/duel", {
          method: "POST",
          body: JSON.stringify({ wordSeed: payload.wordSeed }),
        });
        setState((s) => ({
          ...s,
          phase: "playing",
          duelSeed: sess.seed,
          matchStartedAt: payload.matchStartedAt,
          maxGuesses: payload.maxGuesses,
          opponent: s.opponent
            ? { ...s.opponent, rows: [], currentAttempt: 0, won: false, lost: false, typing: false }
            : s.opponent,
        }));
        pushMessage({
          id: Math.random().toString(36).slice(2),
          name: "System",
          avatarSeed: "glyph",
          content: "Match started. Same word. Good luck.",
          type: "system",
          ts: Date.now(),
        });
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
          ? {
              ...s,
              opponent: {
                ...s.opponent,
                won: f.won,
                lost: !f.won,
                finishedAt: Date.now(),
                finishTimeMs: f.durationMs,
              },
            }
          : s
      );
    });
    socketRef.current = sock;
    return sock;
  }, [player, pushMessage, pushReaction]);

  // ---- Bot mode ----
  const startBotLoop = useCallback(() => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    const bot = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const targetGuesses = 3 + Math.floor(Math.random() * 4); // 3-6
    const willSolve = Math.random() < 0.72;
    botStateRef.current = {
      attempt: 0,
      correctSoFar: 0,
      targetGuesses,
      willSolve,
      name: bot.name,
      seed: bot.seed,
    };

    setState((s) => ({
      ...s,
      opponent: {
        id: "bot",
        name: bot.name,
        avatarSeed: bot.seed,
        status: "playing",
        rows: [],
        currentAttempt: 0,
        won: false,
        lost: false,
        typing: false,
      },
    }));

    const tick = () => {
      const bs = botStateRef.current;
      if (!bs) return;
      bs.attempt += 1;
      const isFinal = bs.willSolve
        ? bs.attempt >= bs.targetGuesses
        : bs.attempt >= 6;
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
          opponent: {
            ...s.opponent,
            rows,
            currentAttempt: bs.attempt,
            won,
            lost,
            finishedAt: won || lost ? Date.now() : undefined,
            finishTimeMs: won || lost ? Date.now() - (s.matchStartedAt ?? Date.now()) : undefined,
            typing: !(won || lost),
          },
        };
      });

      if (!(isSolving || (!bs.willSolve && bs.attempt >= 6))) {
        // typing indicator then next guess
        setState((s) => (s.opponent ? { ...s, opponent: { ...s.opponent, typing: true } } : s));
        const delay = 3200 + Math.random() * 3200;
        botTimerRef.current = setTimeout(tick, delay);
      } else {
        botTimerRef.current = setTimeout(() => {
          pushMessage({
            id: Math.random().toString(36).slice(2),
            name: "System",
            avatarSeed: "glyph",
            content: `${bot.name} ${isSolving ? "decoded the grid" : "ran out of guesses"}.`,
            type: "system",
            ts: Date.now(),
          });
        }, 600);
      }
    };

    // initial typing then first guess
    setState((s) => (s.opponent ? { ...s, opponent: { ...s.opponent, typing: true } } : s));
    botTimerRef.current = setTimeout(tick, 2400 + Math.random() * 2000);
  }, [pushMessage]);

  const quickMatch = useCallback(async () => {
    if (!player) return;
    const wordSeed = genWordSeed();
    try {
      const sess = await api<{ seed: string; maxGuesses: number }>("/api/words/duel", {
        method: "POST",
        body: JSON.stringify({ wordSeed }),
      });
      setState((s) => ({
        ...s,
        phase: "playing",
        mode: "bot",
        roomCode: null,
        duelSeed: sess.seed,
        matchStartedAt: Date.now(),
        maxGuesses: sess.maxGuesses,
        messages: [],
        reactions: [],
        presenceError: null,
      }));
      pushMessage({
        id: Math.random().toString(36).slice(2),
        name: "System",
        avatarSeed: "glyph",
        content: "Quick match started. Opponent inbound…",
        type: "system",
        ts: Date.now(),
      });
      startBotLoop();
    } catch {
      setState((s) => ({ ...s, presenceError: "Failed to start quick match." }));
    }
  }, [player, pushMessage, startBotLoop]);

  // ---- Online mode ----
  const createRoom = useCallback(async () => {
    if (!player) return;
    const sock = ensureSocket();
    const code = genRoomCode();
    setState((s) => ({
      ...s,
      phase: "waiting",
      mode: "online",
      roomCode: code,
      messages: [],
      reactions: [],
      presenceError: null,
    }));
    sock.emit("room:create", { name: player.username, avatarSeed: player.avatarSeed, playerId: player.id });
    pushMessage({
      id: Math.random().toString(36).slice(2),
      name: "System",
      avatarSeed: "glyph",
      content: `Room ${code} created. Share the code with a friend.`,
      type: "system",
      ts: Date.now(),
    });
  }, [player, ensureSocket, pushMessage]);

  const joinRoom = useCallback(
    async (code: string) => {
      if (!player) return;
      const sock = ensureSocket();
      setState((s) => ({
        ...s,
        phase: "waiting",
        mode: "online",
        roomCode: code.toUpperCase(),
        messages: [],
        reactions: [],
        presenceError: null,
      }));
      sock.emit("room:join", {
        roomId: code.toUpperCase(),
        name: player.username,
        avatarSeed: player.avatarSeed,
        playerId: player.id,
      });
      pushMessage({
        id: Math.random().toString(36).slice(2),
        name: "System",
        avatarSeed: "glyph",
        content: `Joining room ${code.toUpperCase()}…`,
        type: "system",
        ts: Date.now(),
      });
    },
    [player, ensureSocket, pushMessage]
  );

  const startOnlineMatch = useCallback(() => {
    if (!state.roomCode) return;
    const sock = socketRef.current;
    if (!sock) return;
    sock.emit("game:start", { roomId: state.roomCode });
  }, [state.roomCode]);

  const sendChat = useCallback(
    (content: string) => {
      if (!player || !content.trim()) return;
      const sock = socketRef.current;
      if (sock && state.mode === "online" && state.roomCode) {
        sock.emit("room:chat", { content: content.trim().slice(0, 200) });
      } else {
        // bot mode: echo locally + bot replies
        pushMessage({
          id: Math.random().toString(36).slice(2),
          name: player.username,
          avatarSeed: player.avatarSeed,
          content: content.trim().slice(0, 200),
          type: "user",
          ts: Date.now(),
        });
      }
    },
    [player, state.mode, state.roomCode, pushMessage]
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      const sock = socketRef.current;
      if (sock && state.mode === "online" && state.roomCode) {
        sock.emit("room:reaction", { emoji });
      } else if (player) {
        pushReaction({
          id: Math.random().toString(36).slice(2),
          name: player.username,
          avatarSeed: player.avatarSeed,
          emoji,
          ts: Date.now(),
        });
      }
    },
    [state.mode, state.roomCode, player, pushReaction]
  );

  const reportMyProgress = useCallback(
    (statuses: TileStatus[], attempt: number, final: boolean) => {
      const sock = socketRef.current;
      if (sock && state.mode === "online" && state.roomCode) {
        sock.emit("game:progress", { roomId: state.roomCode, attempt, statuses, final });
      }
    },
    [state.mode, state.roomCode]
  );

  const reportMyTyping = useCallback(
    (typing: boolean) => {
      const sock = socketRef.current;
      if (sock && state.mode === "online" && state.roomCode) {
        sock.emit("game:typing", { roomId: state.roomCode, typing });
      }
    },
    [state.mode, state.roomCode]
  );

  const reportMyFinish = useCallback(
    (won: boolean, guessesUsed: number, durationMs: number) => {
      const sock = socketRef.current;
      if (sock && state.mode === "online" && state.roomCode) {
        sock.emit("game:finish", { roomId: state.roomCode, won, guessesUsed, durationMs });
      }
    },
    [state.mode, state.roomCode]
  );

  const reset = useCallback(() => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    botStateRef.current = null;
    const sock = socketRef.current;
    if (sock && state.roomCode) {
      sock.emit("room:leave");
    }
    setState({
      phase: "lobby",
      mode: null,
      roomCode: null,
      duelSeed: null,
      matchStartedAt: null,
      maxGuesses: 6,
      opponent: null,
      messages: [],
      reactions: [],
      presenceError: null,
    });
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
