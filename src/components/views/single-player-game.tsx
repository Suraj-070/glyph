"use client";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Lightbulb, ArrowLeft, Target, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WordleBoard } from "@/components/game/wordle-board";
import { WordleKeyboard } from "@/components/game/wordle-keyboard";
import { WordExplain } from "@/components/game/word-explain";
import { ResultModal } from "@/components/game/result-modal";
import { Confetti } from "@/components/game/confetti";
import { GameTimer } from "@/components/game/game-timer";
import { useWordleGame, type GameEndResult } from "@/hooks/use-wordle-game";
import { useGlyph } from "@/lib/store";
import { api } from "@/lib/api";

interface SinglePlayerGameProps {
  mode: "classic" | "practice";
}

interface SessionInfo {
  seed: string;
  maxGuesses: number;
  dailyType?: string;
  dailyDate?: string;
  rewardXp?: number;
  isChallengeDay?: boolean;
  countdownMs?: number;
}

export function SinglePlayerGame({ mode }: SinglePlayerGameProps) {
  const setView = useGlyph((s) => s.setView);
  const bumpStats = useGlyph((s) => s.bumpStats);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<{
    open: boolean;
    won: boolean;
    word: string;
    guessesUsed: number;
    durationMs: number;
    xpEarned?: number;
    rankDelta?: number;
    currentStreak?: number;
    unlocked: string[];
    alreadyPlayed?: boolean;
  } | null>(null);

  const fetchSession = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const endpoint = mode === "classic" ? "/api/words/daily" : "/api/words/practice";
      const info = await api<SessionInfo>(endpoint);
      setSession(info);
      setStartedAt(Date.now());
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const onGameEnd = useCallback(
    async (r: GameEndResult) => {
      try {
        const res = await api<{
          won: boolean;
          word: string;
          xpEarned: number;
          rankDelta: number;
          currentStreak: number;
          unlockedAchievements: string[];
          alreadyPlayed: boolean;
        }>("/api/game/submit", {
          method: "POST",
          body: JSON.stringify({
            seed: session?.seed,
            mode,
            guessesUsed: r.guessesUsed,
            won: r.won,
            durationMs: r.durationMs,
            guesses: r.guesses.map((g, i) => ({
              text: g.guess,
              result: g.statuses
                .map((s) => (s === "correct" ? "c" : s === "present" ? "p" : "a"))
                .join(""),
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
          currentStreak: res.currentStreak,
          unlocked: res.unlockedAchievements || [],
          alreadyPlayed: res.alreadyPlayed,
        });
        bumpStats();
      } catch {
        setResult({
          open: true,
          won: r.won,
          word: r.word,
          guessesUsed: r.guessesUsed,
          durationMs: r.durationMs,
          unlocked: [],
        });
      }
    },
    [session, mode, bumpStats]
  );

  const game = useWordleGame({
    seed: session?.seed ?? null,
    maxGuesses: session?.maxGuesses ?? 6,
    mode,
    onGameEnd,
  });

  const closeResult = () => {
    setResult((r) => (r ? { ...r, open: false } : null));
    if (mode === "practice") {
      fetchSession();
    }
  };

  const share = () => {
    if (!result || !session) return;
    const emoji = (s: string) =>
      s === "c" ? "🟩" : s === "p" ? "🟨" : "⬛";
    const grid = game.guesses
      .map((g) => g.statuses.map((st) => emoji(st === "correct" ? "c" : st === "present" ? "p" : "a")).join(""))
      .join("\n");
    const text = `GLYPH ${result.won ? `${result.guessesUsed}/6` : "X/6"}${session.isChallengeDay ? " 🔥" : ""}\n${grid}\n\nDecode the grid →`;
    navigator.clipboard?.writeText(text).then(
      () => showToast("Results copied to clipboard"),
      () => showToast("Copy failed")
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="h-10 w-10 mx-auto rounded-xl bg-teal/20 animate-pulse mb-3" />
          <p className="text-sm text-muted-foreground">Loading the grid…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">Failed to load the word session.</p>
          <Button onClick={fetchSession} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const Icon = mode === "classic" ? Target : Dumbbell;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      {/* header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-teal/15 text-teal flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold leading-tight">
                {mode === "classic" ? "Daily Challenge" : "Practice Arena"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {mode === "classic"
                  ? session.isChallengeDay
                    ? `${session.dailyType === "hardcore" ? "Hardcore" : "Challenge"} Day · ${session.maxGuesses} guesses`
                    : `${session.maxGuesses} guesses · 5 letters`
                  : "Unlimited · AI hints available"}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GameTimer startedAt={startedAt} running={game.status === "playing"} />
          {mode === "practice" ? (
            <Button variant="outline" size="sm" onClick={fetchSession}>
              <RefreshCw className="h-4 w-4 mr-1" /> New word
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* board + keyboard */}
        <div className="flex flex-col items-center gap-5">
          {game.error ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-rose-300 bg-rose-500/15 px-3 py-1.5 rounded-lg"
            >
              {game.error}
            </motion.div>
          ) : null}
          <WordleBoard
            guesses={game.guesses}
            current={game.current}
            maxGuesses={game.maxGuesses}
            wordLength={game.wordLength}
            revealing={game.revealing}
            shakingRow={game.shakingRow}
            size="lg"
          />
          <WordleKeyboard
            onKey={game.onKey}
            keyStates={game.keyStates}
            disabled={game.status !== "playing"}
          />

          {mode === "practice" && game.status === "playing" ? (
            <div className="w-full max-w-lg">
              <PracticeHints seed={session.seed} />
            </div>
          ) : null}
        </div>

        {/* side panel */}
        <div className="space-y-4">
          {game.status === "playing" ? (
            <div className="glass rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                {mode === "classic" ? "Daily info" : "How to play"}
              </div>
              {mode === "classic" ? (
                <div className="space-y-2 text-sm">
                  <Row label="Reward" value={`${session.rewardXp ?? 100} XP`} accent="#fbbf24" />
                  <Row label="Max guesses" value={String(session.maxGuesses)} />
                  <Row
                    label="Type"
                    value={session.isChallengeDay ? `${session.dailyType} day` : "Normal"}
                    accent={session.isChallengeDay ? "#fb7185" : undefined}
                  />
                </div>
              ) : (
                <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
                  <li>🟩 Green = correct letter, correct spot</li>
                  <li>🟨 Yellow = correct letter, wrong spot</li>
                  <li>⬛ Gray = letter not in word</li>
                  <li>Use AI hints on the left if stuck.</li>
                </ul>
              )}
            </div>
          ) : null}

          {game.status !== "playing" && result?.word ? (
            <WordExplain word={result.word} />
          ) : null}
        </div>
      </div>

      <Confetti active={!!result?.open && result.won} />

      <ResultModal
        open={!!result?.open}
        won={result?.won ?? false}
        word={result?.word ?? ""}
        guessesUsed={result?.guessesUsed ?? 0}
        durationMs={result?.durationMs ?? 0}
        xpEarned={result?.xpEarned}
        rankDelta={result?.rankDelta}
        currentStreak={result?.currentStreak}
        unlockedAchievements={result?.unlocked}
        onClose={closeResult}
        onShare={share}
        showAi
      />
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}

function PracticeHints({ seed }: { seed: string }) {
  // hint panel needs the secret word, which only the server knows.
  // We provide a button that reveals a hint via /api/ai/hint — but hint needs the word.
  // For practice, expose a lightweight endpoint to get the word ONLY when game is practice + hint requested.
  // To keep it secure-ish, we fetch the word via a dedicated reveal endpoint gated to practice mode.
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState<number | null>(null);

  const fetchHint = async (level: number) => {
    setLoading(level);
    try {
      // get the practice word (practice-only reveal)
      const w = await api<{ word: string }>("/api/words/practice/reveal", {
        method: "POST",
        body: JSON.stringify({ seed }),
      });
      const res = await api<{ level: number; hint: string }>("/api/ai/hint", {
        method: "POST",
        body: JSON.stringify({ word: w.word, level }),
      });
      setHint(res.hint);
    } catch {
      setHint("Hint unavailable.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="glass rounded-xl p-3 flex items-center gap-2 flex-wrap">
      <Lightbulb className="h-4 w-4 text-amber" />
      <span className="text-xs text-muted-foreground">Need a nudge?</span>
      <div className="flex gap-1.5 ml-auto">
        {[1, 2, 3].map((lvl) => (
          <button
            key={lvl}
            onClick={() => fetchHint(lvl)}
            disabled={loading !== null}
            className="text-[11px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 disabled:opacity-50"
          >
            {loading === lvl ? "…" : `Hint ${"·".repeat(lvl)}`}
          </button>
        ))}
      </div>
      {hint ? (
        <div className="w-full text-xs text-foreground/90 bg-white/5 rounded-lg px-3 py-2 mt-1">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function showToast(msg: string) {
  if (typeof window !== "undefined") {
    import("@/components/ui/sonner").then(({ toast }) => toast.success(msg));
  }
}
