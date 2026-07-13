"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Skull, RotateCcw, Share2, Zap, Flame, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WordExplain } from "./word-explain";
import { formatDuration } from "@/lib/api";

interface ResultModalProps {
  open: boolean;
  won: boolean;
  word: string;
  guessesUsed: number;
  durationMs: number;
  xpEarned?: number;
  rankDelta?: number;
  currentStreak?: number;
  unlockedAchievements?: string[];
  opponentName?: string;
  opponentWon?: boolean | null;
  onRematch?: () => void;
  onClose?: () => void;
  onShare?: () => void;
  showAi?: boolean;
  pendingSync?: boolean;
}

export function ResultModal({
  open,
  won,
  word,
  guessesUsed,
  durationMs,
  xpEarned,
  rankDelta,
  currentStreak,
  unlockedAchievements = [],
  opponentName,
  opponentWon,
  onRematch,
  onClose,
  onShare,
  showAi = true,
  pendingSync = false,
}: ResultModalProps) {
  const [aiOpen, setAiOpen] = useState(false);
  // reset AI panel when a new word arrives — state-adjust-during-render pattern
  const [lastWord, setLastWord] = useState(word);
  if (word !== lastWord) {
    setLastWord(word);
    setAiOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="glass-strong rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto scroll-glyph"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div
              className={`relative px-6 pt-7 pb-5 text-center rounded-t-2xl ${
                won
                  ? "bg-gradient-to-b from-emerald-500/20 to-transparent"
                  : "bg-gradient-to-b from-rose-500/15 to-transparent"
              }`}
            >
              {onClose ? (
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", delay: 0.1, damping: 12 }}
                className={`mx-auto h-16 w-16 rounded-2xl flex items-center justify-center mb-3 ${
                  won ? "bg-emerald-500/20 text-emerald-300 glow-teal" : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {won ? <Trophy className="h-8 w-8" /> : <Skull className="h-8 w-8" />}
              </motion.div>
              <h2 className="text-2xl font-bold">
                {won ? "Grid Decoded!" : "Grid Locked"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {won
                  ? `Solved in ${guessesUsed} ${guessesUsed === 1 ? "guess" : "guesses"} · ${formatDuration(durationMs)}`
                  : `The word eluded you after ${guessesUsed} guesses`}
              </p>

              {opponentName ? (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs">
                  <span className="text-muted-foreground">vs</span>
                  <span className="font-semibold">{opponentName}</span>
                  {opponentWon !== null && opponentWon !== undefined ? (
                    <span
                      className={
                        opponentWon === won
                          ? "text-amber"
                          : opponentWon
                          ? "text-emerald-300"
                          : "text-rose-300"
                      }
                    >
                      {opponentWon ? "won" : "lost"}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* word reveal */}
              <div className="text-center">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  The word was
                </div>
                <div className="text-4xl font-black tracking-[0.2em] text-gradient">
                  {word}
                </div>
              </div>

              {/* rewards */}
              <div className="grid grid-cols-3 gap-2">
                {typeof xpEarned === "number" ? (
                  <div className="rounded-xl glass p-3 text-center">
                    <Zap className="h-4 w-4 mx-auto text-amber mb-1" />
                    <div className="text-lg font-bold text-amber">+{xpEarned}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">XP</div>
                  </div>
                ) : null}
                {typeof rankDelta === "number" ? (
                  <div className="rounded-xl glass p-3 text-center">
                    <Trophy className="h-4 w-4 mx-auto text-teal mb-1" />
                    <div
                      className={`text-lg font-bold ${
                        rankDelta >= 0 ? "text-teal" : "text-rose-300"
                      }`}
                    >
                      {rankDelta >= 0 ? "+" : ""}
                      {rankDelta}
                    </div>
                    <div className="text-[10px] uppercase text-muted-foreground">RP</div>
                  </div>
                ) : null}
                {typeof currentStreak === "number" ? (
                  <div className="rounded-xl glass p-3 text-center">
                    <Flame className="h-4 w-4 mx-auto text-orange-400 mb-1" />
                    <div className="text-lg font-bold text-orange-400">{currentStreak}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">Streak</div>
                  </div>
                ) : null}
              </div>

              {/* achievements */}
              {unlockedAchievements.length > 0 ? (
                <div className="rounded-xl glass p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                    <Trophy className="h-3 w-3 text-violet" /> Achievements Unlocked
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {unlockedAchievements.map((a) => (
                      <span
                        key={a}
                        className="text-xs px-2 py-1 rounded-md bg-violet/15 text-violet border border-violet/30"
                      >
                        {achievementLabel(a)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* AI explanation */}
              {pendingSync ? (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-300">
                  Offline — result saved. XP will sync automatically when connection returns.
                </div>
              ) : null}
              {showAi && word ? (
                aiOpen ? (
                  <WordExplain word={word} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAiOpen(true)}
                    className="w-full glass rounded-xl p-3 text-xs font-semibold text-teal flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                  >
                    ✨ What does “{word}” mean?
                  </button>
                )
              ) : null}

              {/* actions */}
              <div className="flex gap-2 pt-1">
                {onShare ? (
                  <Button variant="outline" className="flex-1" onClick={onShare}>
                    <Share2 className="h-4 w-4 mr-2" /> Share
                  </Button>
                ) : null}
                {onRematch ? (
                  <Button className="flex-1 bg-teal text-teal-foreground hover:bg-teal/90" onClick={onRematch}>
                    <RotateCcw className="h-4 w-4 mr-2" /> Rematch
                  </Button>
                ) : null}
                {onClose && !onRematch ? (
                  <Button className="flex-1" onClick={onClose}>
                    Continue
                  </Button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function achievementLabel(type: string): string {
  const map: Record<string, string> = {
    first_win: "First Victory",
    sharpshooter: "Sharpshooter",
    speed_demon: "Speed Demon",
    streak_7: "7-Day Streak",
    streak_30: "30-Day Streak",
    streak_100: "Centurion",
    duel_master: "Duel Master",
    wordsmith: "Wordsmith",
  };
  return map[type] ?? type;
}
