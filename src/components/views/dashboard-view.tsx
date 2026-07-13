"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Flame,
  Trophy,
  Target,
  Swords,
  Users,
  Dumbbell,
  Zap,
  Clock,
  TrendingUp,
  Crown,
  Sparkles,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/common/avatar";
import { RankBadge, RankIcon } from "@/components/common/rank-badge";
import { StatCard } from "@/components/common/stat-card";
import { Countdown } from "@/components/game/game-timer";
import { useGlyph } from "@/lib/store";
import { api, formatDuration, formatTime } from "@/lib/api";
import { useCachedApi, invalidateCache } from "@/lib/use-cached-api";
import { rankForPoints } from "@/lib/types";

interface DashboardViewProps {
  player: {
    username: string;
    avatarSeed: string;
    level: number;
    rankPoints: number;
    xp: number;
    xpIntoLevel: number;
    xpForLevel: number;
  } | null;
  statsNonce: number;
}

interface DailyInfo {
  dailyType: string;
  rewardXp: number;
  isChallengeDay: boolean;
  countdownMs: number;
  maxGuesses: number;
  global: { plays: number; wins: number; avgGuesses: number };
}

interface StatsData {
  streaks: { current: number; longest: number; winStreak: number; freezeCount: number };
  record: {
    totalGames: number;
    wins: number;
    winRate: number;
    avgGuesses: number;
    bestTimeMs: number | null;
    duelWins: number;
    favoriteFirstWord: string | null;
  };
  player: {
    rank: string;
    rankLabel: string;
    rankColor: string;
    nextRank: string | null;
    pointsToNextRank: number;
  };
  recentGames: Array<{
    id: string;
    mode: string;
    won: boolean;
    guessesUsed: number;
    durationMs: number;
    isDaily: boolean;
    opponentName: string | null;
    dailyDate: string | null;
    xpEarned: number;
    completedAt: string;
    word: string;
  }>;
}

interface LeaderData {
  leaderboard: Array<{
    position: number;
    username: string;
    avatarSeed: string;
    rankTier: string;
    rankColor: string;
    level: number;
    rankPoints: number;
    currentStreak: number;
    isMe: boolean;
  }>;
  friends: Array<{
    id: string;
    username: string;
    avatarSeed: string;
    status: string;
    rankTier: string;
    level: number;
  }>;
  myPosition: number;
}

export function DashboardView({ player, statsNonce }: DashboardViewProps) {
  const setView = useGlyph((s) => s.setView);
  const startDuel = useGlyph((s) => s.startDuel);
  const [daily, setDaily] = useState<DailyInfo | null>(null);
  const { data: stats, refresh: refreshStats } = useCachedApi<StatsData>("/api/stats");
  const { data: leader, refresh: refreshLeader } = useCachedApi<LeaderData>("/api/leaderboard");

  useEffect(() => {
    api<DailyInfo>("/api/words/daily").then(setDaily).catch(() => {});
  }, []);

  useEffect(() => {
    if (statsNonce > 0) {
      invalidateCache("/api/stats");
      invalidateCache("/api/leaderboard");
      void refreshStats(true);
      void refreshLeader(true);
    }
  }, [statsNonce, refreshStats, refreshLeader]);

  const rank = player ? rankForPoints(player.rankPoints) : null;

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6 max-w-7xl mx-auto">
      {/* Hero / Today's challenge */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl glass-strong p-6 sm:p-8"
      >
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div
          className={`absolute -top-20 -right-20 h-64 w-64 rounded-full blur-3xl opacity-30 ${
            daily?.isChallengeDay ? "bg-amber" : "bg-teal"
          }`}
        />
        <div className="relative flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                Today's Challenge
              </span>
              {daily?.isChallengeDay ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber/20 text-amber uppercase tracking-wide flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {daily.dailyType === "hardcore" ? "Hardcore" : "Challenge"} Day
                </span>
              ) : null}
            </div>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">
              {daily?.isChallengeDay ? (
                <>
                  Rare word. <span className="text-gradient-amber">Double rewards.</span>
                </>
              ) : (
                <>
                  Crack today's <span className="text-gradient">5-letter grid.</span>
                </>
              )}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm max-w-lg">
              {daily?.isChallengeDay
                ? "Challenge days feature rarer words and bonus XP. Test your vocabulary against the world."
                : "A new word drops for everyone, every day. Keep your streak alive and climb the ranks."}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <Button
                size="lg"
                className="bg-teal text-teal-foreground hover:bg-teal/90 gap-2"
                onClick={() => setView("classic")}
              >
                <Target className="h-4 w-4" /> Play Daily
              </Button>
              <Button size="lg" variant="outline" className="gap-2" onClick={() => startDuel(cryptoRoom())}>
                <Swords className="h-4 w-4" /> Quick Duel
              </Button>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
                <Clock className="h-3.5 w-3.5" />
                Next word in <Countdown key={daily?.countdownMs ?? 0} ms={daily?.countdownMs ?? 0} className="text-teal font-semibold" />
              </div>
            </div>
          </div>

          {/* daily meta card */}
          <div className="w-full lg:w-56 glass rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Reward</span>
              <span className="flex items-center gap-1 text-amber font-bold">
                <Zap className="h-3 w-3" /> {daily?.rewardXp ?? 100} XP
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Max guesses</span>
              <span className="font-bold">{daily?.maxGuesses ?? 6}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Global stats
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Plays</span>
              <span className="font-bold">{daily?.global.plays ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Win rate</span>
              <span className="font-bold">
                {daily && daily.global.plays > 0
                  ? Math.round((daily.global.wins / daily.global.plays) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Avg guesses</span>
              <span className="font-bold">{daily?.global.avgGuesses ?? "—"}</span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Stat cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Flame}
          label="Current Streak"
          value={stats?.streaks.current ?? 0}
          sub={`Best ${stats?.streaks.longest ?? 0} days`}
          accent="#fb923c"
          delay={0.05}
        />
        <StatCard
          icon={Trophy}
          label="Win Rate"
          value={`${stats?.record.winRate ?? 0}%`}
          sub={`${stats?.record.wins ?? 0} wins`}
          accent="#2dd4bf"
          delay={0.1}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Guesses"
          value={(stats?.record.avgGuesses ?? 0).toFixed(1)}
          sub={`${stats?.record.totalGames ?? 0} games`}
          accent="#a78bfa"
          delay={0.15}
        />
        <StatCard
          icon={Zap}
          label="Total XP"
          value={(player?.xp ?? 0).toLocaleString()}
          sub={`Level ${player?.level ?? 1}`}
          accent="#fbbf24"
          delay={0.2}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: rank + recent matches */}
        <div className="lg:col-span-2 space-y-6">
          {/* Rank card */}
          {player && rank ? (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center gap-4">
                <div
                  className="h-16 w-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ backgroundColor: `${rank.color}1a`, color: rank.color }}
                >
                  <RankIcon tier={rank.tier} size={32} />
                </div>
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Competitive Rank
                  </div>
                  <div className="text-2xl font-bold" style={{ color: rank.color }}>
                    {rank.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {player.rankPoints.toLocaleString()} RP
                    {stats?.player.nextRank
                      ? ` · ${stats.player.pointsToNextRank} to ${stats.player.nextRank}`
                      : " · Max tier reached"}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setView("leaderboard")}>
                  <Crown className="h-4 w-4 mr-1" /> Ranks
                </Button>
              </div>
              {/* progress to next rank */}
              <div className="mt-4 h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${rank.color}, ${rank.color}aa)` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${rankProgressPct(player.rankPoints, stats?.player.nextRank)}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            </motion.section>
          ) : null}

          {/* Recent matches */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-teal" /> Recent Matches
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setView("profile")}>
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            {stats?.recentGames && stats.recentGames.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto scroll-glyph">
                {stats.recentGames.map((g, i) => (
                  <RecentMatchRow key={g.id} g={g} delay={i * 0.04} />
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No matches yet. Play your first grid!
              </div>
            )}
          </motion.section>
        </div>

        {/* Right: friends online + game modes */}
        <div className="space-y-6">
          {/* Friends online */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2">
                <Users className="h-4 w-4 text-teal" /> Friends Online
              </h3>
              <span className="text-xs text-muted-foreground">
                {leader?.friends.filter((f) => f.status !== "offline").length ?? 0} online
              </span>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto scroll-glyph">
              {leader?.friends && leader.friends.length > 0 ? (
                leader.friends
                  .sort((a, b) => statusOrder(a.status) - statusOrder(b.status))
                  .slice(0, 8)
                  .map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
                    >
                      <Avatar seed={f.avatarSeed} name={f.username} size={32} status={f.status} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{f.username}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">
                          {f.status === "playing" ? "In a match" : f.status}
                        </div>
                      </div>
                      <button
                        onClick={() => startDuel(cryptoRoom())}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-teal hover:underline"
                      >
                        Challenge
                      </button>
                    </div>
                  ))
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  No friends yet. Bots are warming up…
                </div>
              )}
            </div>
          </motion.section>

          {/* Quick play modes */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-5 space-y-2"
          >
            <h3 className="font-bold mb-2">Quick Play</h3>
            <ModeButton
              icon={Target}
              title="Daily Challenge"
              desc="Today's global word"
              accent="#2dd4bf"
              onClick={() => setView("classic")}
            />
            <ModeButton
              icon={Swords}
              title="Real-time Duel"
              desc="1v1 live · same word"
              accent="#fb7185"
              badge="LIVE"
              onClick={() => startDuel(cryptoRoom())}
            />
            <ModeButton
              icon={Users}
              title="Party Mode"
              desc="2–20 players arena"
              accent="#a78bfa"
              onClick={() => setView("party")}
            />
            <ModeButton
              icon={Dumbbell}
              title="Practice"
              desc="Unlimited words + AI hints"
              accent="#fbbf24"
              onClick={() => setView("practice")}
            />
          </motion.section>
        </div>
      </div>
    </div>
  );
}

function statusOrder(s: string): number {
  return { online: 0, playing: 1, idle: 2, offline: 3 }[s] ?? 4;
}

function rankProgressPct(points: number, nextRank: string | null | undefined): number {
  if (!nextRank) return 100;
  // crude estimate for bar fill
  const tiers = [0, 300, 900, 1800, 3200, 5000, 8000];
  const idx = tiers.findIndex((t) => points < t);
  const start = idx > 0 ? tiers[idx - 1] : 0;
  const end = idx >= 0 ? tiers[idx] : 8000;
  return Math.min(100, Math.max(4, ((points - start) / (end - start)) * 100));
}

function cryptoRoom(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function RecentMatchRow({
  g,
  delay,
}: {
  g: StatsData["recentGames"][number];
  delay: number;
}) {
  const modeIcon =
    g.mode === "duel" ? Swords : g.mode === "practice" ? Dumbbell : Target;
  const Icon = modeIcon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5 transition-colors"
    >
      <div
        className={`h-9 w-9 rounded-lg flex items-center justify-center ${
          g.won ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium capitalize">
          {g.mode}
          {g.opponentName ? <span className="text-muted-foreground"> vs {g.opponentName}</span> : null}
          {g.isDaily ? <span className="text-muted-foreground"> · Daily</span> : null}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {g.guessesUsed} guesses · {formatTime(g.durationMs)} ·{" "}
          {new Date(g.completedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {g.won ? (
          <span className="text-xs font-bold text-amber flex items-center gap-0.5">
            <Zap className="h-3 w-3" />+{g.xpEarned}
          </span>
        ) : null}
        <span
          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
            g.won ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {g.won ? "Win" : "Loss"}
        </span>
      </div>
    </motion.div>
  );
}

function ModeButton({
  icon: Icon,
  title,
  desc,
  accent,
  badge,
  onClick,
}: {
  icon: typeof Target;
  title: string;
  desc: string;
  accent: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-white/5 transition-all group text-left"
    >
      <div
        className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}1a`, color: accent }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          {title}
          {badge ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase">
              {badge}
            </span>
          ) : null}
        </div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
    </button>
  );
}