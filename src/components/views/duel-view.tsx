"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords,
  Users,
  Bot,
  Copy,
  Check,
  Send,
  Radio,
  Sparkles,
  X,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WordleBoard } from "@/components/game/wordle-board";
import { WordleKeyboard } from "@/components/game/wordle-keyboard";
import { OpponentBoard } from "@/components/game/opponent-board";
import { OpponentBubble, FloatingChatBubble } from "@/components/game/floating-hud";
import { ResultModal } from "@/components/game/result-modal";
import { Confetti } from "@/components/game/confetti";
import { GameTimer } from "@/components/game/game-timer";
import { Avatar } from "@/components/common/avatar";
import { useDuel } from "@/hooks/use-duel";
import { useWordleGame, type GameEndResult } from "@/hooks/use-wordle-game";
import { useGlyph } from "@/lib/store";
import { api, classNames } from "@/lib/api";
import type { TileStatus } from "@/lib/types";

interface DuelViewProps {
  player: {
    id: string;
    username: string;
    avatarSeed: string;
  } | null;
}

const REACTIONS = [
  { emoji: "🔥", label: "Nice" },
  { emoji: "😂", label: "Almost" },
  { emoji: "😱", label: "Lucky" },
  { emoji: "👏", label: "Clap" },
  { emoji: "🤔", label: "Hmm" },
  { emoji: "⚡", label: "Fast" },
];

// ── Countdown overlay ──────────────────────────────────────────────────────
function CountdownOverlay({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count === 0) { onDone(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <AnimatePresence mode="wait">
        {count > 0 ? (
          <motion.div
            key={count}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.6 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="text-center select-none"
          >
            <div
              className="text-[10rem] font-black leading-none tabular-nums"
              style={{
                background: count === 3
                  ? "linear-gradient(135deg, #2dd4bf, #a78bfa)"
                  : count === 2
                  ? "linear-gradient(135deg, #a78bfa, #fb7185)"
                  : "linear-gradient(135deg, #fb7185, #fbbf24)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textShadow: "none",
                filter: "drop-shadow(0 0 40px currentColor)",
              }}
            >
              {count}
            </div>
            <p className="text-white/40 text-sm mt-4 tracking-widest uppercase">
              {count === 3 ? "Get ready…" : count === 2 ? "Focus…" : "GO!"}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="go"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.8 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-[6rem] font-black text-teal select-none"
          >
            GO!
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Join Room Modal ────────────────────────────────────────────────────────
function JoinRoomModal({
  open,
  onClose,
  onJoin,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  onJoin: (code: string) => void;
  disabled: boolean;
}) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setCode(""); setTimeout(() => inputRef.current?.focus(), 80); }
  }, [open]);

  const submit = () => {
    if (code.length === 6 && !disabled) { onJoin(code); onClose(); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="glass-strong rounded-2xl w-full max-w-xs p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-amber/15 text-amber flex items-center justify-center">
                  <Hash className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-sm">Join Room</div>
                  <div className="text-[10px] text-muted-foreground">Enter a 6-letter code</div>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* code input */}
            <Input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="ABC123"
              className="text-center font-mono tracking-[0.4em] text-xl h-12 mb-4 uppercase"
              maxLength={6}
            />

            {/* slots preview */}
            <div className="flex gap-1.5 justify-center mb-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={classNames(
                    "h-9 w-9 rounded-lg border-2 flex items-center justify-center font-mono font-black text-sm transition-all",
                    i < code.length
                      ? "border-amber bg-amber/10 text-amber"
                      : "border-white/10 text-transparent"
                  )}
                >
                  {code[i] ?? "·"}
                </div>
              ))}
            </div>

            <Button
              onClick={submit}
              disabled={code.length !== 6 || disabled}
              className="w-full bg-amber text-black font-bold hover:bg-amber/90"
            >
              <Users className="h-4 w-4 mr-2" /> Join Arena
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main DuelView ──────────────────────────────────────────────────────────
export function DuelView({ player }: DuelViewProps) {
  const bumpStats = useGlyph((s) => s.bumpStats);
  const duel = useDuel({ player });
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const [chatFocused, setChatFocused] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  // countdown: null = not started, true = counting, false = done (game live)
  const [countdown, setCountdown] = useState<boolean | null>(null);
  const [result, setResult] = useState<{
    open: boolean;
    won: boolean;
    word: string;
    guessesUsed: number;
    durationMs: number;
    xpEarned?: number;
    rankDelta?: number;
    opponentWon?: boolean;
    opponentName?: string;
  } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [duel.messages]);

  // ── BUG FIX: trigger countdown when duelSeed arrives (game:started received)
  // Previously the waiting spinner never stopped because phase stays "waiting"
  // until game:started flips it to "playing" — but we need a countdown in between.
  // Solution: watch duel.phase transition to "playing" and show countdown first.
  const prevPhase = useRef(duel.phase);
  useEffect(() => {
    if (prevPhase.current !== "playing" && duel.phase === "playing") {
      setCountdown(true); // start countdown
    }
    prevPhase.current = duel.phase;
  }, [duel.phase]);

  const onCountdownDone = useCallback(() => {
    setCountdown(false);
  }, []);

  const onGuessFinalized = useCallback(
    (g: { statuses: TileStatus[] }, attempt: number, won: boolean, finished: boolean) => {
      duel.reportMyProgress(g.statuses, attempt, finished);
    },
    [duel]
  );

  const gameTokenRef = useRef<string | null>(null);

  const onGameEnd = useCallback(
    async (r: GameEndResult) => {
      duel.reportMyFinish(r.won, r.guessesUsed, r.durationMs);
      try {
        const res = await api<{
          won: boolean;
          word: string;
          xpEarned: number;
          rankDelta: number;
          unlockedAchievements: string[];
        }>("/api/game/submit", {
          method: "POST",
          body: JSON.stringify({
            token: gameTokenRef.current,
            mode: "duel",
            guessesUsed: r.guessesUsed,
            won: r.won,
            durationMs: r.durationMs,
            opponentName: duel.opponent?.name,
            guesses: r.guesses.map((g, i) => ({
              text: g.guess,
              result: g.statuses.map((s) => (s === "correct" ? "c" : s === "present" ? "p" : "a")).join(""),
              attempt: i + 1,
            })),
          }),
        });
        setResult({
          open: true,
          won: r.won,
          word: res.word || r.word,
          guessesUsed: r.guessesUsed,
          durationMs: r.durationMs,
          xpEarned: res.xpEarned,
          rankDelta: res.rankDelta,
          opponentWon: duel.opponent?.won,
          opponentName: duel.opponent?.name,
        });
        bumpStats();
      } catch {
        setResult({
          open: true,
          won: r.won,
          word: r.word,
          guessesUsed: r.guessesUsed,
          durationMs: r.durationMs,
          opponentWon: duel.opponent?.won,
          opponentName: duel.opponent?.name,
        });
      }
    },
    [duel, bumpStats]
  );

  // typing indicator (throttled)
  const lastTypingRef = useRef(0);
  const reportTyping = useCallback(
    (typing: boolean) => {
      const now = Date.now();
      if (typing && now - lastTypingRef.current < 800) return;
      lastTypingRef.current = now;
      duel.reportMyTyping(typing);
    },
    [duel]
  );

  const game = useWordleGame({
    seed: duel.duelSeed,
    maxGuesses: duel.maxGuesses,
    mode: "duel",
    onGuessFinalized: (g, attempt, won, finished) => {
      gameTokenRef.current = game.getToken();
      onGuessFinalized?.(g, attempt, won, finished);
    },
    onGameEnd,
    // lock keyboard during countdown
    locked: chatFocused || countdown === true,
  });

  // keep gameTokenRef in sync
  useEffect(() => { gameTokenRef.current = game.getToken(); });

  // BUG FIX #2: opponentForfeited stale-closure fix
  useEffect(() => {
    if (duel.opponentForfeited && game.status === "playing" && !result) {
      const guessCount = game.guesses.length;
      const duration = duel.matchStartedAt ? Date.now() - duel.matchStartedAt : 0;
      setResult({
        open: true, won: true, word: "",
        guessesUsed: guessCount, durationMs: duration,
        opponentWon: false, opponentName: duel.opponent?.name,
      });
      duel.reportMyFinish(true, Math.max(1, guessCount), duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.opponentForfeited, game.status, game.guesses.length, result]);

  // typing report
  useEffect(() => {
    if (game.current && duel.phase === "playing" && duel.mode === "online") {
      reportTyping(true);
    }
  }, [game.current, duel.phase, duel.mode, reportTyping]);

  const matchOutcome = (() => {
    if (!result) return null;
    const oppWon = duel.opponent?.won;
    if (result.won && !oppWon) return "win";
    if (!result.won && oppWon) return "loss";
    if (result.won && oppWon) {
      const oppGuesses = duel.opponent?.currentAttempt ?? 99;
      if (result.guessesUsed < oppGuesses) return "win";
      if (result.guessesUsed > oppGuesses) return "loss";
      const oppTime = duel.opponent?.finishTimeMs ?? 999999;
      return result.durationMs <= oppTime ? "win" : "loss";
    }
    return "loss";
  })();

  const copyCode = () => {
    if (duel.roomCode) {
      navigator.clipboard?.writeText(duel.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const sendChat = () => { duel.sendChat(chatInput); setChatInput(""); };

  // ── LOBBY ──────────────────────────────────────────────────────────────
  if (duel.phase === "lobby") {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex h-16 w-16 rounded-2xl bg-rose-500/15 text-rose-300 items-center justify-center mb-3 glow-violet">
            <Swords className="h-8 w-8" />
          </div>
          <h2 className="text-3xl font-black">Real-time Duel</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-md mx-auto">
            Same hidden word. Same start. First to decode wins — fewer guesses and faster time break ties.
          </p>
        </motion.div>

        {/* Quick match — full width hero card */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => duel.quickMatch()}
          disabled={!player}
          className="w-full glass-strong rounded-2xl p-6 text-left hover:glow-teal transition-all group disabled:opacity-50 mb-4 flex items-center gap-5"
        >
          <div className="h-14 w-14 rounded-2xl bg-teal/15 text-teal flex items-center justify-center shrink-0">
            <Bot className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-xl">Quick Match</div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Instant 1v1 vs an AI opponent. Always available, no waiting.
            </p>
          </div>
          <div className="text-teal font-semibold text-sm flex items-center gap-1.5 shrink-0 group-hover:gap-2.5 transition-all">
            Play now <Sparkles className="h-4 w-4" />
          </div>
        </motion.button>

        {/* Create + Join — horizontal side by side */}
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => duel.createRoom()}
            disabled={!player}
            className="glass rounded-2xl p-5 text-left hover:bg-white/5 transition-all group disabled:opacity-50 flex flex-col"
          >
            <div className="h-11 w-11 rounded-xl bg-violet/15 text-violet flex items-center justify-center mb-3">
              <Radio className="h-5 w-5" />
            </div>
            <div className="font-bold text-base">Create Room</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Get a code and wait for a friend to join live.
            </p>
            <div className="text-xs text-violet font-semibold mt-3">Create arena →</div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            onClick={() => setJoinModalOpen(true)}
            disabled={!player}
            className="glass rounded-2xl p-5 text-left hover:bg-white/5 transition-all group disabled:opacity-50 flex flex-col"
          >
            <div className="h-11 w-11 rounded-xl bg-amber/15 text-amber flex items-center justify-center mb-3">
              <Users className="h-5 w-5" />
            </div>
            <div className="font-bold text-base">Join Room</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Have a friend's 6-letter code? Jump straight in.
            </p>
            <div className="text-xs text-amber font-semibold mt-3">Enter code →</div>
          </motion.button>
        </div>

        {duel.presenceError ? (
          <div className="mt-4 text-xs text-amber bg-amber/10 rounded-lg px-3 py-2 text-center">
            {duel.presenceError}
          </div>
        ) : null}

        {/* rules */}
        <div className="glass rounded-xl p-4 mt-5 text-xs text-muted-foreground space-y-1.5">
          <div className="font-semibold text-foreground mb-1">Duel rules</div>
          <div>• Both players receive the identical hidden word.</div>
          <div>• You see only your opponent's <span className="text-teal">colored progress</span> — never their letters.</div>
          <div>• Win priority: solved → fewest guesses → fastest time.</div>
          <div>• Chat & limited reactions are available during the match.</div>
        </div>

        {/* Join modal */}
        <JoinRoomModal
          open={joinModalOpen}
          onClose={() => setJoinModalOpen(false)}
          onJoin={(code) => duel.joinRoom(code)}
          disabled={!player}
        />
      </div>
    );
  }

  // ── WAITING (online room) ───────────────────────────────────────────────
  if (duel.phase === "waiting") {
    // BUG FIX: opponent detection — check both duel.opponent AND room:state players
    // duel.opponent is set from room:state when players array has others
    const opponentJoined = !!duel.opponent;

    return (
      <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-2xl p-8 text-center"
        >
          {/* status icon */}
          <div className="relative inline-flex mb-4">
            <div className={classNames(
              "h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-500",
              opponentJoined ? "bg-teal/15 text-teal" : "bg-violet/15 text-violet"
            )}>
              {opponentJoined
                ? <Users className="h-7 w-7" />
                : <Radio className="h-7 w-7 animate-pulse" />
              }
            </div>
            {/* spinning ring — only when waiting */}
            {!opponentJoined && (
              <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="26" stroke="url(#ring-grad)" strokeWidth="2" strokeDasharray="60 100" strokeLinecap="round" />
                <defs>
                  <linearGradient id="ring-grad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#a78bfa" />
                    <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            )}
          </div>

          <h2 className="text-2xl font-bold">
            {opponentJoined ? `${duel.opponent!.name} is here!` : "Waiting for opponent"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {opponentJoined
              ? duel.isHost
                ? "Ready to duel? Hit Start Match when you are."
                : "Waiting for the host to start the match…"
              : "Share this room code — they'll join instantly."}
          </p>

          {/* room code */}
          {duel.roomCode ? (
            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="glass rounded-xl px-6 py-3 font-mono text-3xl tracking-[0.3em] font-black text-gradient">
                {duel.roomCode}
              </div>
              <Button variant="outline" size="icon" onClick={copyCode} title="Copy code">
                {copied ? <Check className="h-4 w-4 text-teal" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <div className="mt-6 glass rounded-xl px-6 py-3 font-mono text-3xl tracking-[0.3em] font-black text-muted-foreground/30 animate-pulse select-none mx-auto w-fit">
              ······
            </div>
          )}

          {/* player slots */}
          <div className="mt-5 flex items-center justify-center gap-4">
            {/* slot 1 — you */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative">
                <Avatar seed={player?.avatarSeed ?? "me"} name={player?.username} size={40} status="online" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-teal border-2 border-background" />
              </div>
              <span className="text-xs font-semibold text-teal truncate max-w-[80px]">{player?.username ?? "You"}</span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <Swords className="h-5 w-5 text-muted-foreground/40" />
              <span className="text-[10px] text-muted-foreground">vs</span>
            </div>

            {/* slot 2 — opponent */}
            <div className="flex flex-col items-center gap-1.5">
              {opponentJoined ? (
                <>
                  <div className="relative">
                    <Avatar seed={duel.opponent!.avatarSeed} name={duel.opponent!.name} size={40} status="online" />
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-background"
                    />
                  </div>
                  <span className="text-xs font-semibold truncate max-w-[80px]">{duel.opponent!.name}</span>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-full bg-white/5 border-2 border-dashed border-white/15 flex items-center justify-center">
                    <span className="text-muted-foreground/30 text-lg">?</span>
                  </div>
                  <span className="text-xs text-muted-foreground/40">Waiting…</span>
                </>
              )}
            </div>
          </div>

          {/* actions */}
          <div className="mt-6 flex flex-col items-center gap-3">
            {opponentJoined ? (
              duel.isHost ? (
                <Button
                  className="bg-teal text-teal-foreground hover:bg-teal/90 px-8"
                  onClick={duel.startOnlineMatch}
                >
                  <Swords className="h-4 w-4 mr-2" /> Start Match
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-teal/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-teal/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  Waiting for host to start
                </div>
              )
            ) : (
              <Button
                variant="outline"
                onClick={() => { duel.reset(); duel.quickMatch(); }}
              >
                <Bot className="h-4 w-4 mr-2" /> Play vs Bot instead
              </Button>
            )}
          </div>
        </motion.div>

        {/* chat in lobby */}
        <ChatPanel
          messages={duel.messages}
          reactions={duel.reactions}
          chatInput={chatInput}
          setChatInput={setChatInput}
          sendChat={sendChat}
          sendReaction={duel.sendReaction}
          chatEndRef={chatEndRef}
          player={player}
        />
      </div>
    );
  }

  // ── PLAYING / FINISHED ─────────────────────────────────────────────────
  // During countdown, we render the game but overlay the countdown
  const gameIsLocked = countdown === true;

  return (
    <div className="px-2 sm:px-6 py-2 sm:py-4 max-w-7xl mx-auto lg:block flex flex-col min-h-[calc(100dvh-8.5rem)]">

      {/* countdown overlay */}
      <AnimatePresence>
        {countdown === true && <CountdownOverlay onDone={onCountdownDone} />}
      </AnimatePresence>

      {/* top bar */}
      <div className="flex items-center justify-between mb-2 sm:mb-4 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <OpponentBubble
            name={duel.opponent?.name ?? "Opponent"}
            avatarSeed={duel.opponent?.avatarSeed ?? "opp"}
            rows={duel.opponent?.rows ?? []}
            maxGuesses={duel.maxGuesses}
            wordLength={5}
            typing={duel.opponent?.typing}
            won={duel.opponent?.won}
            lost={duel.opponent?.lost}
          />
        </div>
        <div className="flex items-center gap-2">
          {duel.mode === "bot" ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal/15 text-teal uppercase tracking-wide flex items-center gap-1">
              <Bot className="h-3 w-3" /> vs Bot
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 uppercase tracking-wide flex items-center gap-1">
              <Radio className="h-3 w-3" /> Live · {duel.roomCode}
            </span>
          )}
          {/* only start timer after countdown */}
          <GameTimer startedAt={countdown === false ? duel.matchStartedAt : null} running={game.status === "playing" && !gameIsLocked} />
        </div>
      </div>

      {duel.opponentGraceUntil ? (
        <div className="mb-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          Opponent disconnected — waiting for them to return…
        </div>
      ) : null}

      <FloatingChatBubble unread={Math.max(0, duel.messages.length - seenCount)}>
        <div onFocusCapture={() => setSeenCount(duel.messages.length)} onClick={() => setSeenCount(duel.messages.length)} className="h-full">
          <ChatPanel
            messages={duel.messages}
            reactions={[]}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sendChat={sendChat}
            sendReaction={duel.sendReaction}
            chatEndRef={chatEndRef}
            player={player}
            onChatFocus={() => setChatFocused(true)}
            onChatBlur={() => setChatFocused(false)}
            compact
          />
        </div>
      </FloatingChatBubble>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_1fr] gap-4 flex-1 lg:flex-none">
        {/* LEFT: your board */}
        <div className="flex flex-col items-center gap-2 sm:gap-3 order-1 lg:order-1 flex-1 lg:flex-none">
          <div className="hidden sm:flex items-center gap-2 self-start">
            <Avatar seed={player?.avatarSeed ?? "me"} name={player?.username} size={28} status="playing" />
            <span className="text-sm font-semibold">{player?.username ?? "You"}</span>
            <span className="text-[10px] text-muted-foreground">(you)</span>
          </div>
          {game.error ? (
            <div className="text-xs text-rose-300 bg-rose-500/15 px-3 py-1.5 rounded-lg">{game.error}</div>
          ) : null}
          <div className="flex-1 lg:flex-none flex items-center">
            <WordleBoard
              guesses={game.guesses}
              current={game.current}
              maxGuesses={game.maxGuesses}
              wordLength={game.wordLength}
              revealing={game.revealing}
              shakingRow={game.shakingRow}
              size="md"
            />
          </div>
          <div className="w-full sticky bottom-0 z-10 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 bg-gradient-to-t from-background via-background/95 to-transparent lg:static lg:p-0 lg:bg-none">
            <WordleKeyboard
              onKey={game.onKey}
              keyStates={game.keyStates}
              disabled={game.status !== "playing" || gameIsLocked}
            />
          </div>
        </div>

        {/* CENTER: status + chat */}
        <div className="order-2 lg:order-2 hidden lg:flex flex-col gap-3">
          <div className="glass rounded-xl p-3 flex items-center justify-between">
            <PlayerChip
              name={player?.username ?? "You"}
              seed={player?.avatarSeed ?? "me"}
              status="playing"
              solved={game.status === "won"}
              guesses={game.guesses.length}
              self
            />
            <div className="px-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">vs</div>
              <Swords className="h-4 w-4 text-rose-400 mx-auto" />
            </div>
            <PlayerChip
              name={duel.opponent?.name ?? "Opponent"}
              seed={duel.opponent?.avatarSeed ?? "opp"}
              status={duel.opponent?.status ?? "playing"}
              solved={duel.opponent?.won ?? false}
              guesses={duel.opponent?.currentAttempt ?? 0}
            />
          </div>

          <div className="glass rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Match Status</div>
            <div className="text-sm font-semibold">
              {gameIsLocked
                ? "Get ready…"
                : game.status === "playing" && !duel.opponent?.won
                ? "Both decoding…"
                : duel.opponent?.won
                ? "Opponent solved — hurry!"
                : game.status === "won"
                ? "You decoded it!"
                : game.status === "lost"
                ? "You're out of guesses"
                : "Match in progress"}
            </div>
            {duel.opponent?.typing && !gameIsLocked ? (
              <div className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-teal">
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-teal animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-teal animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="w-1 h-1 rounded-full bg-teal animate-bounce" style={{ animationDelay: "240ms" }} />
                </span>
                {duel.opponent.name} is typing
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {REACTIONS.map((r) => (
              <button
                key={r.emoji}
                onClick={() => duel.sendReaction(r.emoji)}
                className="h-8 w-8 rounded-lg glass hover:bg-white/10 transition-all hover:scale-110 active:scale-95 text-base"
                title={r.label}
              >
                {r.emoji}
              </button>
            ))}
          </div>

          <div className="relative h-8">
            <AnimatePresence>
              {duel.reactions.map((r) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 10, scale: 0.6 }}
                  animate={{ opacity: 1, y: -10, scale: 1 }}
                  exit={{ opacity: 0, y: -30, scale: 0.6 }}
                  className="absolute left-1/2 -translate-x-1/2 text-2xl"
                >
                  {r.emoji}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <ChatPanel
            messages={duel.messages}
            reactions={[]}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sendChat={sendChat}
            sendReaction={() => {}}
            chatEndRef={chatEndRef}
            player={player}
            onChatFocus={() => setChatFocused(true)}
            onChatBlur={() => setChatFocused(false)}
            compact
          />
        </div>

        {/* RIGHT: opponent board */}
        <div className="order-3 hidden lg:flex flex-col gap-3">
          <div className="glass rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3">
              <Avatar
                seed={duel.opponent?.avatarSeed ?? "opp"}
                name={duel.opponent?.name}
                size={32}
                status={duel.opponent?.status ?? "playing"}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{duel.opponent?.name ?? "Waiting…"}</div>
                <div className="text-[10px] text-muted-foreground">
                  Guess {duel.opponent?.currentAttempt ?? 0}/{duel.maxGuesses}
                  {duel.opponent?.won ? " · Solved" : duel.opponent?.lost ? " · Out" : ""}
                </div>
              </div>
            </div>
            <OpponentBoard
              rows={duel.opponent?.rows ?? []}
              maxGuesses={duel.maxGuesses}
              wordLength={5}
              typing={duel.opponent?.typing}
              won={duel.opponent?.won}
              lost={duel.opponent?.lost}
              size="sm"
            />
            <div className="mt-3 text-[10px] text-center text-muted-foreground">
              🔒 Opponent letters are hidden — colors only
            </div>
          </div>
        </div>
      </div>

      <Confetti active={!!result?.open && matchOutcome === "win"} />

      <ResultModal
        open={!!result?.open}
        won={matchOutcome === "win"}
        word={result?.word ?? ""}
        guessesUsed={result?.guessesUsed ?? 0}
        durationMs={result?.durationMs ?? 0}
        xpEarned={result?.xpEarned}
        rankDelta={result?.rankDelta}
        opponentName={result?.opponentName}
        opponentWon={result?.opponentWon}
        onRematch={async () => {
          setResult(null);
          setCountdown(null);
          duel.reset();
          await new Promise((r) => setTimeout(r, 50));
          duel.quickMatch();
        }}
        onClose={() => { setResult(null); setCountdown(null); duel.reset(); }}
        showAi
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PlayerChip({ name, seed, status, solved, guesses, self }: {
  name: string; seed: string; status: string;
  solved: boolean; guesses: number; self?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <Avatar seed={seed} name={name} size={32} status={status} />
      <div className="min-w-0">
        <div className={classNames("text-xs font-semibold truncate", self && "text-teal")}>{name}</div>
        <div className="text-[10px] text-muted-foreground">
          {solved ? "✓ Solved" : `${guesses} guesses`}
        </div>
      </div>
    </div>
  );
}

function ChatPanel({
  messages, reactions, chatInput, setChatInput, sendChat,
  sendReaction, chatEndRef, player, compact, onChatFocus, onChatBlur,
}: {
  messages: Array<{ id: string; name: string; avatarSeed: string; content: string; type: string; ts: number }>;
  reactions: Array<{ id: string; emoji: string; name: string }>;
  chatInput: string;
  setChatInput: (s: string) => void;
  sendChat: () => void;
  sendReaction: (e: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  player: { username: string; avatarSeed: string } | null;
  compact?: boolean;
  onChatFocus?: () => void;
  onChatBlur?: () => void;
}) {
  return (
    <div className={classNames("glass rounded-xl flex flex-col", compact ? "h-44" : "h-56")}>
      <div className="flex-1 overflow-y-auto scroll-glyph p-2.5 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-4">No messages yet. Say hi 👋</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={classNames("flex items-start gap-2", m.type === "system" && "justify-center")}>
              {m.type === "system" ? (
                <span className="text-[10px] text-muted-foreground italic px-2 py-0.5 rounded-full bg-white/5">
                  {m.content}
                </span>
              ) : (
                <>
                  <Avatar seed={m.avatarSeed} name={m.name} size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-muted-foreground">
                      {m.name === player?.username ? "You" : m.name}
                    </div>
                    <div className="text-xs text-foreground/90 break-words">{m.content}</div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="p-2 border-t border-white/5 flex gap-1.5">
        <Input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onFocus={onChatFocus}
          onBlur={onChatBlur}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") sendChat(); }}
          placeholder="Message…"
          className="h-8 text-xs"
          maxLength={200}
        />
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={sendChat}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}