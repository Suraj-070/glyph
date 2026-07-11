"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, ArrowLeft, Crown, RefreshCw, Eye, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WordleBoard } from "@/components/game/wordle-board";
import { WordleKeyboard } from "@/components/game/wordle-keyboard";
import { ResultModal } from "@/components/game/result-modal";
import { Confetti } from "@/components/game/confetti";
import { GameTimer } from "@/components/game/game-timer";
import { Avatar } from "@/components/common/avatar";
import { RankBadge } from "@/components/common/rank-badge";
import { useWordleGame, type GameEndResult } from "@/hooks/use-wordle-game";
import { useGlyph } from "@/lib/store";
import { api, classNames } from "@/lib/api";
import type { TileStatus } from "@/lib/types";

interface PartyBot {
  name: string;
  seed: string;
  rankTier: string;
  status: "playing" | "solved" | "out";
  guesses: number;
  maxGuesses: number;
  progress: number; // 0-5 greens
  finishTimeMs: number | null;
  rows: TileStatus[][];
}

const PARTY_BOTS = [
  { name: "NeonCipher", seed: "NeonCipher", rankTier: "master" },
  { name: "QuantumFox", seed: "QuantumFox", rankTier: "diamond" },
  { name: "CyberRaven", seed: "CyberRaven", rankTier: "platinum" },
  { name: "SolarDrake", seed: "SolarDrake", rankTier: "gold" },
];

export function PartyView() {
  const setView = useGlyph((s) => s.setView);
  const bumpStats = useGlyph((s) => s.bumpStats);
  const [seed, setSeed] = useState<string | null>(null);
  const [maxGuesses, setMaxGuesses] = useState(6);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<PartyBot[]>([]);
  const [result, setResult] = useState<{
    open: boolean;
    won: boolean;
    word: string;
    guessesUsed: number;
    durationMs: number;
    placement: number;
  } | null>(null);
  const botTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const startParty = useCallback(async () => {
    setLoading(true);
    setResult(null);
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];
    try {
      const sess = await api<{ seed: string; maxGuesses: number }>("/api/words/practice");
      setSeed(sess.seed);
      setMaxGuesses(sess.maxGuesses);
      setStartedAt(Date.now());
      // init bots
      const initBots: PartyBot[] = PARTY_BOTS.map((b) => ({
        name: b.name,
        seed: b.seed,
        rankTier: b.rankTier,
        status: "playing",
        guesses: 0,
        maxGuesses: 6,
        progress: 0,
        finishTimeMs: null,
        rows: [],
      }));
      setBots(initBots);
      scheduleBots(initBots, Date.now());
    } catch {
      setSeed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startParty();
    return () => botTimers.current.forEach(clearTimeout);
  }, [startParty]);

  const scheduleBots = (initBots: PartyBot[], startTime: number) => {
    initBots.forEach((bot, idx) => {
      const target = 3 + Math.floor(Math.random() * 4); // 3-6
      const willSolve = Math.random() < 0.7;
      let attempt = 0;
      let correct = 0;
      const tick = () => {
        attempt++;
        const isSolve = willSolve && attempt >= target;
        const isFail = !willSolve && attempt >= 6;
        let statuses: TileStatus[];
        if (isSolve) {
          statuses = Array(5).fill("correct");
          correct = 5;
        } else {
          const gain = attempt === 1 ? 0 : Math.floor(Math.random() * 3);
          correct = Math.min(5, correct + gain);
          statuses = Array.from({ length: 5 }, (_, i) =>
            i < correct ? "correct" : Math.random() < 0.3 ? "present" : "absent"
          );
          // shuffle
          for (let i = statuses.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
          }
          let greens = statuses.filter((s) => s === "correct").length;
          if (greens < correct) {
            let need = correct - greens;
            for (let i = 0; i < statuses.length && need > 0; i++) {
              if (statuses[i] !== "correct") {
                statuses[i] = "correct";
                need--;
              }
            }
          } else correct = greens;
        }
        setBots((prev) =>
          prev.map((b, i) =>
            i === idx
              ? {
                  ...b,
                  guesses: attempt,
                  progress: correct,
                  status: isSolve ? "solved" : isFail ? "out" : "playing",
                  finishTimeMs: isSolve || isFail ? Date.now() - startTime : null,
                  rows: [...b.rows, statuses],
                }
              : b
          )
        );
        if (!(isSolve || isFail)) {
          const t = setTimeout(tick, 3000 + Math.random() * 3500);
          botTimers.current.push(t);
        }
      };
      const t0 = setTimeout(tick, 2200 + idx * 600 + Math.random() * 1500);
      botTimers.current.push(t0);
    });
  };

  const onGameEnd = useCallback(
    async (r: GameEndResult) => {
      try {
        await api("/api/game/submit", {
          method: "POST",
          body: JSON.stringify({
            seed,
            mode: "practice",
            guessesUsed: r.guessesUsed,
            won: r.won,
            durationMs: r.durationMs,
            guesses: r.guesses.map((g, i) => ({
              text: g.guess,
              result: g.statuses.map((s) => (s === "correct" ? "c" : s === "present" ? "p" : "a")).join(""),
              attempt: i + 1,
            })),
          }),
        });
        bumpStats();
      } catch {
        /* ignore */
      }
      // compute placement
      const solvedBots = bots.filter((b) => b.status === "solved").length;
      const botSolveTimes = bots
        .filter((b) => b.status === "solved" && b.finishTimeMs !== null)
        .map((b) => b.finishTimeMs as number);
      let placement = 1;
      if (r.won) {
        placement = 1 + botSolveTimes.filter((t) => t < r.durationMs).length;
      } else {
        placement = 1 + solvedBots;
      }
      setResult({
        open: true,
        won: r.won,
        word: r.word,
        guessesUsed: r.guessesUsed,
        durationMs: r.durationMs,
        placement,
      });
    },
    [seed, bots, bumpStats]
  );

  const game = useWordleGame({
    seed,
    maxGuesses,
    mode: "practice",
    onGameEnd,
  });

  // live leaderboard: player + bots, sorted by status then progress then time
  const leaderboard = [
    {
      name: "You",
      seed: "me",
      rankTier: "platinum",
      status: game.status === "won" ? "solved" : game.status === "lost" ? "out" : "playing",
      guesses: game.guesses.length,
      progress: game.guesses.length > 0
        ? game.guesses[game.guesses.length - 1].statuses.filter((s) => s === "correct").length
        : 0,
      finishTimeMs: game.status === "won" || game.status === "lost" ? (startedAt ? Date.now() - startedAt : 0) : null,
      isMe: true,
    },
    ...bots.map((b) => ({
      name: b.name,
      seed: b.seed,
      rankTier: b.rankTier,
      status: b.status,
      guesses: b.guesses,
      progress: b.progress,
      finishTimeMs: b.finishTimeMs,
      isMe: false,
    })),
  ].sort((a, b) => {
    const rank = (s: string) => (s === "solved" ? 0 : s === "playing" ? 1 : 2);
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    if (a.status === "solved" && b.status === "solved") {
      return (a.finishTimeMs ?? 0) - (b.finishTimeMs ?? 0);
    }
    return b.progress - a.progress;
  });

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-violet/15 text-violet flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold leading-tight">Party Mode</div>
              <div className="text-[11px] text-muted-foreground">
                You + 4 bots · live leaderboard
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GameTimer startedAt={startedAt} running={game.status === "playing"} />
          <Button variant="outline" size="sm" onClick={startParty} disabled={loading}>
            <RefreshCw className={classNames("h-4 w-4 mr-1", loading && "animate-spin")} /> New round
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-violet" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* board */}
          <div className="flex flex-col items-center gap-4">
            {game.error ? (
              <div className="text-xs text-rose-300 bg-rose-500/15 px-3 py-1.5 rounded-lg">
                {game.error}
              </div>
            ) : null}
            <WordleBoard
              guesses={game.guesses}
              current={game.current}
              maxGuesses={game.maxGuesses}
              wordLength={game.wordLength}
              revealing={game.revealing}
              shakingRow={game.shakingRow}
              size="md"
            />
            <WordleKeyboard
              onKey={game.onKey}
              keyStates={game.keyStates}
              disabled={game.status !== "playing"}
            />
          </div>

          {/* live leaderboard */}
          <div className="space-y-3">
            <div className="glass rounded-xl p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber" /> Live Standings
                </h3>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Spectating
                </span>
              </div>
              <div className="space-y-1.5">
                <AnimatePresence>
                  {leaderboard.map((p, i) => (
                    <motion.div
                      key={p.name + p.seed}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={classNames(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                        p.isMe ? "bg-teal/10 ring-1 ring-teal/30" : "bg-white/5",
                        i === 0 && p.status === "solved" && "glow-teal"
                      )}
                    >
                      <div
                        className={classNames(
                          "h-6 w-6 rounded-md flex items-center justify-center text-xs font-bold",
                          i === 0 ? "bg-amber/20 text-amber" : "bg-white/5 text-muted-foreground"
                        )}
                      >
                        {i + 1}
                      </div>
                      <Avatar seed={p.seed} name={p.name} size={28} status={p.status === "playing" ? "playing" : "offline"} />
                      <div className="flex-1 min-w-0">
                        <div className={classNames("text-xs font-semibold truncate", p.isMe && "text-teal")}>
                          {p.name} {p.isMe ? "(you)" : ""}
                        </div>
                        {/* progress bar (greens) */}
                        <div className="flex gap-0.5 mt-1">
                          {Array.from({ length: 5 }).map((_, k) => (
                            <div
                              key={k}
                              className={classNames(
                                "h-1.5 flex-1 rounded-full",
                                k < p.progress ? "bg-emerald-400" : "bg-white/10"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground">
                          {p.status === "solved"
                            ? `${(p.finishTimeMs ?? 0) / 1000 | 0}s`
                            : p.status === "out"
                            ? "OUT"
                            : `${p.guesses} g`}
                        </div>
                        <RankBadge tier={p.rankTier} size="sm" showLabel={false} />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="glass rounded-xl p-3 text-[11px] text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground mb-1">Party rules</div>
              <div>• Everyone gets the same word.</div>
              <div>• First to decode wins. Ties → fewer guesses → faster time.</div>
              <div>• Bots simulate real opponents. Spectators see color-only progress.</div>
              <div className="flex items-center gap-1 text-violet mt-2">
                <Zap className="h-3 w-3" /> Full 2–20 player support coming with live rooms.
              </div>
            </div>
          </div>
        </div>
      )}

      <Confetti active={!!result?.open && (result?.won ?? false) && (result?.placement ?? 99) <= 1} />

      <ResultModal
        open={!!result?.open}
        won={result?.won ?? false}
        word={result?.word ?? ""}
        guessesUsed={result?.guessesUsed ?? 0}
        durationMs={result?.durationMs ?? 0}
        onClose={() => {
          setResult(null);
          startParty();
        }}
        onShare={undefined}
        showAi
      />
    </div>
  );
}
