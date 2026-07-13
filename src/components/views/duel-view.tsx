"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords,
  Users,
  Bot,
  ArrowLeft,
  Copy,
  Check,
  Send,
  Zap,
  Trophy,
  Flame,
  Loader2,
  Radio,
  Sparkles,
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

export function DuelView({ player }: DuelViewProps) {
  const setView = useGlyph((s) => s.setView);
  const bumpStats = useGlyph((s) => s.bumpStats);
  const duel = useDuel({ player });
  const [joinCode, setJoinCode] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const [chatFocused, setChatFocused] = useState(false);
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
    locked: chatFocused,
  });

  // keep gameTokenRef in sync after each guess
  useEffect(() => {
    gameTokenRef.current = game.getToken();
  });

  // opponent forfeited mid-match -> instant win for us
  useEffect(() => {
    if (duel.opponentForfeited && game.status === "playing" && !result) {
      setResult({
        open: true,
        won: true,
        word: "",
        guessesUsed: game.guesses.length,
        durationMs: duel.matchStartedAt ? Date.now() - duel.matchStartedAt : 0,
        opponentWon: false,
        opponentName: duel.opponent?.name,
      });
      duel.reportMyFinish(true, Math.max(1, game.guesses.length), 0);
    }
  }, [duel.opponentForfeited]);

  // report typing when current changes
  useEffect(() => {
    if (game.current && duel.phase === "playing" && duel.mode === "online") {
      reportTyping(true);
    }
  }, [game.current, duel.phase, duel.mode, reportTyping]);

  // determine match outcome for the modal (compare with opponent)
  const matchOutcome = (() => {
    if (!result) return null;
    const oppWon = duel.opponent?.won;
    if (result.won && !oppWon) return "win";
    if (!result.won && oppWon) return "loss";
    if (result.won && oppWon) {
      // both solved — fewer guesses wins, then time
      const oppGuesses = duel.opponent?.currentAttempt ?? 99;
      if (result.guessesUsed < oppGuesses) return "win";
      if (result.guessesUsed > oppGuesses) return "loss";
      const oppTime = duel.opponent?.finishTimeMs ?? 999999;
      return result.durationMs <= oppTime ? "win" : "loss";
    }
    // neither solved — it's a draw/loss
    return "loss";
  })();

  const copyCode = () => {
    if (duel.roomCode) {
      navigator.clipboard?.writeText(duel.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const sendChat = () => {
    duel.sendChat(chatInput);
    setChatInput("");
  };

  // ---------- LOBBY ----------
  if (duel.phase === "lobby") {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setView("dashboard")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex h-16 w-16 rounded-2xl bg-rose-500/15 text-rose-300 items-center justify-center mb-3 glow-violet">
            <Swords className="h-8 w-8" />
          </div>
          <h2 className="text-3xl font-black">Real-time Duel</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-md mx-auto">
            Same hidden word. Same start. First to decode wins — fewer guesses and faster time break ties.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Quick match (bot) */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            onClick={() => duel.quickMatch()}
            disabled={!player}
            className="glass-strong rounded-2xl p-6 text-left hover:glow-teal transition-all group disabled:opacity-50"
          >
            <div className="h-11 w-11 rounded-xl bg-teal/15 text-teal flex items-center justify-center mb-3">
              <Bot className="h-5 w-5" />
            </div>
            <div className="font-bold text-lg">Quick Match</div>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Instant 1v1 vs an AI opponent. Always available.
            </p>
            <div className="text-xs text-teal font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
              Start now <Sparkles className="h-3 w-3" />
            </div>
          </motion.button>

          {/* Create room */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => duel.createRoom()}
            disabled={!player}
            className="glass rounded-2xl p-6 text-left hover:bg-white/5 transition-all group disabled:opacity-50"
          >
            <div className="h-11 w-11 rounded-xl bg-violet/15 text-violet flex items-center justify-center mb-3">
              <Radio className="h-5 w-5" />
            </div>
            <div className="font-bold text-lg">Create Room</div>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Get a code, share it, and wait for a friend to join live.
            </p>
            <div className="text-xs text-violet font-semibold">Create arena →</div>
          </motion.button>

          {/* Join room */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass rounded-2xl p-6"
          >
            <div className="h-11 w-11 rounded-xl bg-amber/15 text-amber flex items-center justify-center mb-3">
              <Users className="h-5 w-5" />
            </div>
            <div className="font-bold text-lg">Join Room</div>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Enter a friend's 6-letter code.
            </p>
            <div className="flex gap-2">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && joinCode.length === 6 && duel.joinRoom(joinCode)}
                placeholder="ABC123"
                className="text-center font-mono tracking-widest uppercase"
                maxLength={6}
              />
              <Button
                size="sm"
                onClick={() => joinCode.length === 6 && duel.joinRoom(joinCode)}
                disabled={joinCode.length !== 6 || !player}
                className="bg-teal text-teal-foreground"
              >
                Join
              </Button>
            </div>
          </motion.div>
        </div>

        {duel.presenceError ? (
          <div className="mt-4 text-xs text-amber bg-amber/10 rounded-lg px-3 py-2 text-center">
            {duel.presenceError}
          </div>
        ) : null}

        {/* rules */}
        <div className="glass rounded-xl p-4 mt-6 text-xs text-muted-foreground space-y-1.5">
          <div className="font-semibold text-foreground mb-1">Duel rules</div>
          <div>• Both players receive the identical hidden word.</div>
          <div>• You see only your opponent's <span className="text-teal">colored progress</span> — never their letters.</div>
          <div>• Win priority: solved → fewest guesses → fastest time.</div>
          <div>• Chat & limited reactions are available during the match.</div>
        </div>
      </div>
    );
  }

  // ---------- WAITING (online room) ----------
  if (duel.phase === "waiting") {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" onClick={duel.reset} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Leave
        </Button>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-2xl p-8 text-center"
        >
          <div className="inline-flex h-14 w-14 rounded-2xl bg-violet/15 text-violet items-center justify-center mb-4 animate-pulse-glow">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold">Waiting for opponent</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Share this room code — they'll join instantly.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            {duel.roomCode ? (
              <>
                <div className="glass rounded-xl px-6 py-3 font-mono text-3xl tracking-[0.3em] font-black text-gradient">
                  {duel.roomCode}
                </div>
                <Button variant="outline" size="icon" onClick={copyCode} title="Copy code">
                  {copied ? <Check className="h-4 w-4 text-teal" /> : <Copy className="h-4 w-4" />}
                </Button>
              </>
            ) : (
              <div className="glass rounded-xl px-6 py-3 font-mono text-3xl tracking-[0.3em] font-black text-muted-foreground/30 animate-pulse select-none">
                ······
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Users className="h-4 w-4" />
            {duel.opponent ? `${duel.opponent.name} joined!` : "1 / 2 players"}
          </div>

          {duel.opponent ? (
            duel.isHost ? (
              <Button
                className="mt-6 bg-teal text-teal-foreground hover:bg-teal/90"
                onClick={duel.startOnlineMatch}
              >
                <Swords className="h-4 w-4 mr-2" /> Start Match
              </Button>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground animate-pulse">
                Waiting for host to start…
              </p>
            )
          ) : (
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => {
                duel.reset();
                duel.quickMatch();
              }}
            >
              <Bot className="h-4 w-4 mr-2" /> Play vs Bot instead
            </Button>
          )}
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

  // ---------- PLAYING / FINISHED ----------
  return (
    <div className="px-2 sm:px-6 py-2 sm:py-4 max-w-7xl mx-auto lg:block flex flex-col min-h-[calc(100dvh-8.5rem)]">
      {/* top bar */}
      <div className="flex items-center justify-between mb-2 sm:mb-4 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Button variant="ghost" size="sm" onClick={duel.reset} className="shrink-0 px-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Exit</span>
          </Button>
          {/* mobile: opponent bubble lives in the bar — no overlap with title */}
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
          <GameTimer startedAt={duel.matchStartedAt} running={game.status === "playing"} />
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
            <div className="text-xs text-rose-300 bg-rose-500/15 px-3 py-1.5 rounded-lg">
              {game.error}
            </div>
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
              disabled={game.status !== "playing"}
            />
          </div>
        </div>

        {/* CENTER: status + chat — desktop only; mobile uses floating HUD */}
        <div className="order-2 lg:order-2 hidden lg:flex flex-col gap-3">
          {/* versus banner */}
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

          {/* live status */}
          <div className="glass rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Match Status
            </div>
            <div className="text-sm font-semibold">
              {game.status === "playing" && !duel.opponent?.won
                ? "Both decoding…"
                : duel.opponent?.won
                ? "Opponent solved — hurry!"
                : game.status === "won"
                ? "You decoded it!"
                : game.status === "lost"
                ? "You're out of guesses"
                : "Match in progress"}
            </div>
            {duel.opponent?.typing ? (
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

          {/* reactions */}
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

          {/* floating reactions */}
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

          {/* chat */}
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

        {/* RIGHT: opponent board (color only) — desktop only */}
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
                <div className="text-sm font-semibold truncate">
                  {duel.opponent?.name ?? "Waiting…"}
                </div>
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
        onRematch={() => {
          setResult(null);
          duel.reset();
          setTimeout(() => duel.quickMatch(), 100);
        }}
        onClose={() => {
          setResult(null);
          duel.reset();
        }}
        showAi
      />
    </div>
  );
}

function PlayerChip({
  name,
  seed,
  status,
  solved,
  guesses,
  self,
}: {
  name: string;
  seed: string;
  status: string;
  solved: boolean;
  guesses: number;
  self?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <Avatar seed={seed} name={name} size={32} status={status} />
      <div className="min-w-0">
        <div className={classNames("text-xs font-semibold truncate", self && "text-teal")}>
          {name}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {solved ? "✓ Solved" : `${guesses} guesses`}
        </div>
      </div>
    </div>
  );
}

function ChatPanel({
  messages,
  reactions,
  chatInput,
  setChatInput,
  sendChat,
  sendReaction,
  chatEndRef,
  player,
  compact,
  onChatFocus,
  onChatBlur,
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
          <div className="text-center text-xs text-muted-foreground py-4">
            No messages yet. Say hi 👋
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={classNames(
                "flex items-start gap-2",
                m.type === "system" && "justify-center"
              )}
            >
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
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") sendChat();
          }}
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