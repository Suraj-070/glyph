"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Flame,
  Trophy,
  Zap,
  Target,
  Clock,
  TrendingUp,
  Award,
  Pencil,
  Sword,
  Star,
  Snowflake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/common/avatar";
import { RankBadge, RankIcon } from "@/components/common/rank-badge";
import { StatCard } from "@/components/common/stat-card";
import { achievementLabel } from "@/components/game/result-modal";
import { useGlyph } from "@/lib/store";
import { api, formatDuration, formatTime } from "@/lib/api";
import { rankForPoints, RANKS } from "@/lib/types";

interface ProfileData {
  player: {
    username: string;
    avatarSeed: string;
    xp: number;
    level: number;
    rankPoints: number;
    rank: string;
    rankLabel: string;
    rankColor: string;
    nextRank: string | null;
    pointsToNextRank: number;
    xpIntoLevel: number;
    xpForLevel: number;
  };
  streaks: {
    current: number;
    longest: number;
    winStreak: number;
    freezeCount: number;
    dailyHistory: Array<{ date: string; won: boolean }>;
  };
  record: {
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    avgGuesses: number;
    avgTimeMs: number;
    bestTimeMs: number | null;
    favoriteFirstWord: string | null;
    duelWins: number;
    duelLosses: number;
  };
  distribution: Record<number, number>;
  achievements: Array<{ type: string; unlockedAt: string }>;
  recentGames: Array<{
    id: string;
    mode: string;
    won: boolean;
    guessesUsed: number;
    durationMs: number;
    opponentName: string | null;
    dailyDate: string | null;
    isDaily: boolean;
    xpEarned: number;
    completedAt: string;
    word: string;
  }>;
}

interface ProfileViewProps {
  player: { id: string; username: string; avatarSeed: string } | null;
  statsNonce: number;
}

const ALL_ACHIEVEMENTS = [
  "first_win",
  "sharpshooter",
  "speed_demon",
  "streak_7",
  "streak_30",
  "streak_100",
  "duel_master",
  "wordsmith",
];

export function ProfileView({ player, statsNonce }: ProfileViewProps) {
  const setView = useGlyph((s) => s.setView);
  const [data, setData] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    api<ProfileData>("/api/stats").then((d) => {
      setData(d);
      setName(d.player.username);
    });
  }, [statsNonce]);

  if (!data) {
    return (
      <div className="px-6 py-20 text-center text-muted-foreground text-sm">
        Loading profile…
      </div>
    );
  }

  const p = data.player;
  const rank = rankForPoints(p.rankPoints);
  const maxDist = Math.max(1, ...Object.values(data.distribution));

  const saveName = async () => {
    if (!name.trim() || name === p.username) {
      setEditing(false);
      return;
    }
    try {
      await api("/api/profile", { method: "POST", body: JSON.stringify({ username: name.trim() }) });
      setEditing(false);
      window.location.reload();
    } catch {
      setEditing(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">
      {/* header card */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong rounded-2xl p-6 relative overflow-hidden"
      >
        <div
          className="absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-30"
          style={{ backgroundColor: rank.color }}
        />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Avatar seed={p.avatarSeed} name={p.username} size={88} status="online" ring />
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2 mb-1">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="max-w-[220px] h-8"
                  maxLength={20}
                  autoFocus
                />
                <Button size="sm" className="bg-teal text-teal-foreground h-8" onClick={saveName}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-black truncate">{p.username}</h2>
                <button
                  onClick={() => setEditing(true)}
                  className="text-muted-foreground hover:text-foreground"
                  title="Edit username"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <RankBadge tier={p.rank} points={p.rankPoints} size="md" />
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Star className="h-3 w-3 text-amber" /> Level {p.level}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber" /> {p.xp.toLocaleString()} XP
              </span>
            </div>
            {/* XP bar */}
            <div className="max-w-md">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>LVL {p.level}</span>
                <span>
                  {p.xpIntoLevel} / {p.xpForLevel} XP
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-teal to-violet"
                  initial={{ width: 0 }}
                  animate={{ width: `${(p.xpIntoLevel / p.xpForLevel) * 100}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* stat cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Flame} label="Current Streak" value={data.streaks.current} sub={`Best ${data.streaks.longest}`} accent="#fb923c" />
        <StatCard icon={Trophy} label="Win Rate" value={`${data.record.winRate}%`} sub={`${data.record.wins}W / ${data.record.losses}L`} accent="#2dd4bf" />
        <StatCard icon={TrendingUp} label="Avg Guesses" value={data.record.avgGuesses.toFixed(1)} sub={`${data.record.totalGames} games`} accent="#a78bfa" />
        <StatCard icon={Sword} label="Duel Record" value={`${data.record.duelWins}-${data.record.duelLosses}`} sub="W-L" accent="#fb7185" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* guess distribution */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5"
        >
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-teal" /> Guess Distribution
          </h3>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const count = data.distribution[n] ?? 0;
              const pct = (count / maxDist) * 100;
              return (
                <div key={n} className="flex items-center gap-3">
                  <span className="text-xs font-mono w-4 text-muted-foreground">{n}</span>
                  <div className="flex-1 h-6 rounded bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-teal/80 to-teal flex items-center justify-end pr-2"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                      transition={{ duration: 0.6, delay: n * 0.05 }}
                    >
                      {count > 0 ? (
                        <span className="text-[10px] font-bold text-black">{count}</span>
                      ) : null}
                    </motion.div>
                  </div>
                </div>
              );
            })}
          </div>
          {data.record.favoriteFirstWord ? (
            <div className="mt-4 text-xs text-muted-foreground">
              Favorite opener:{" "}
              <span className="font-mono font-bold text-gradient">
                {data.record.favoriteFirstWord}
              </span>
            </div>
          ) : null}
        </motion.section>

        {/* streak calendar + freezes */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-5"
        >
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" /> Streak History
          </h3>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-3xl font-black text-orange-400">{data.streaks.current}</div>
              <div className="text-[10px] uppercase text-muted-foreground">Current</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-amber">{data.streaks.longest}</div>
              <div className="text-[10px] uppercase text-muted-foreground">Longest</div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-2xl font-black text-cyan-300">
                <Snowflake className="h-5 w-5" /> {data.streaks.freezeCount}
              </div>
              <div className="text-[10px] uppercase text-muted-foreground">Freezes</div>
            </div>
          </div>
          {/* last 14 days */}
          <div className="grid grid-cols-7 gap-1.5">
            {data.streaks.dailyHistory.slice(-14).map((h, i) => (
              <div
                key={i}
                className={`aspect-square rounded text-[8px] flex items-center justify-center font-bold ${
                  h.won ? "bg-emerald-500/30 text-emerald-200" : "bg-rose-500/20 text-rose-200"
                }`}
                title={`${h.date}: ${h.won ? "won" : "lost"}`}
              >
                {Number(h.date.slice(-2))}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 14 - data.streaks.dailyHistory.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square rounded bg-white/5" />
            ))}
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">
            Last 14 days · green = solved, red = missed
          </div>
        </motion.section>
      </div>

      {/* achievements */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5"
      >
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <Award className="h-4 w-4 text-violet" /> Achievements
          <span className="text-xs text-muted-foreground font-normal">
            {data.achievements.length} / {ALL_ACHIEVEMENTS.length}
          </span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ALL_ACHIEVEMENTS.map((a) => {
            const unlocked = data.achievements.find((x) => x.type === a);
            return (
              <div
                key={a}
                className={`rounded-xl p-3 text-center transition-all ${
                  unlocked
                    ? "glass-strong glow-violet"
                    : "bg-white/5 opacity-40 grayscale"
                }`}
              >
                <div
                  className={`h-10 w-10 mx-auto rounded-full flex items-center justify-center mb-2 ${
                    unlocked ? "bg-violet/20 text-violet" : "bg-white/5 text-muted-foreground"
                  }`}
                >
                  <Trophy className="h-5 w-5" />
                </div>
                <div className="text-xs font-semibold">{achievementLabel(a)}</div>
                {unlocked ? (
                  <div className="text-[9px] text-muted-foreground mt-0.5">
                    {new Date(unlocked.unlockedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                ) : (
                  <div className="text-[9px] text-muted-foreground mt-0.5">Locked</div>
                )}
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* rank ladder */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5"
      >
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <RankIcon tier={p.rank} /> Rank Ladder
        </h3>
        <div className="space-y-1.5">
          {RANKS.map((r) => {
            const isCurrent = r.tier === p.rank;
            const isPassed = p.rankPoints >= r.minPoints;
            return (
              <div
                key={r.tier}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                  isCurrent ? "glass-strong" : ""
                }`}
                style={isCurrent ? { boxShadow: `0 0 0 1px ${r.color}40` } : undefined}
              >
                <RankIcon tier={r.tier} size={16} />
                <span
                  className="font-semibold text-sm w-24"
                  style={{ color: isPassed ? r.color : undefined }}
                >
                  {r.label}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: isPassed ? "100%" : `${Math.min(100, (p.rankPoints / r.minPoints) * 100)}%`,
                      backgroundColor: r.color,
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-12 text-right">
                  {r.minPoints}+
                </span>
                {isCurrent ? (
                  <span className="text-[9px] font-bold text-teal uppercase">You</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* recent matches */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5"
      >
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-teal" /> Match History
        </h3>
        {data.recentGames.length > 0 ? (
          <div className="space-y-1.5 max-h-96 overflow-y-auto scroll-glyph">
            {data.recentGames.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5"
              >
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                    g.won ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {g.mode === "duel" ? <Sword className="h-4 w-4" /> : <Target className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium capitalize">
                    {g.mode}
                    {g.opponentName ? <span className="text-muted-foreground"> vs {g.opponentName}</span> : null}
                    {g.isDaily ? <span className="text-muted-foreground"> · Daily</span> : null}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {g.guessesUsed}/6 · {formatTime(g.durationMs)} ·{" "}
                    {new Date(g.completedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-amber">+{g.xpEarned} XP</div>
                  <div className={`text-[9px] uppercase ${g.won ? "text-emerald-300" : "text-rose-300"}`}>
                    {g.won ? "Win" : "Loss"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No matches yet.
          </div>
        )}
      </motion.section>
    </div>
  );
}
