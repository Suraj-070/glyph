// GET /api/stats — full stats for the current player
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";
import {
  getDailyHistory,
  computeCurrentStreak,
  computeAverages,
  favoriteFirstWord,
} from "@/lib/stats";
import {
  rankForPoints,
  nextRank,
  levelForXp,
  xpProgress,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const player = await getCurrentPlayer();

  // everything below only needs player.id — run in ONE parallel batch
  const [profile, history, fav, achievements, recentGames, streakFreeze] =
    await Promise.all([
      db.playerProfile.upsert({
        where: { playerId: player.id },
        update: {},
        create: { playerId: player.id },
        include: { player: true },
      }),
      getDailyHistory(player.id),
      favoriteFirstWord(player.id),
      db.achievement.findMany({
        where: { playerId: player.id },
        orderBy: { unlockedAt: "desc" },
      }),
      db.game.findMany({
        where: { playerId: player.id },
        orderBy: { completedAt: "desc" },
        take: 8,
        select: {
          id: true,
          mode: true,
          won: true,
          guessesUsed: true,
          durationMs: true,
          isDaily: true,
          dailyDate: true,
          opponentName: true,
          xpEarned: true,
          completedAt: true,
          word: true,
        },
      }),
      db.streakFreeze.upsert({
        where: { playerId: player.id },
        update: {},
        create: { playerId: player.id, count: 2 },
      }),
    ]);

  const liveStreak = computeCurrentStreak(history);
  if (liveStreak !== profile.currentStreak) {
    // fire-and-forget: response doesn't need to wait for the correction
    db.playerProfile
      .update({
        where: { playerId: player.id },
        data: {
          currentStreak: liveStreak,
          longestStreak: Math.max(profile.longestStreak, liveStreak),
        },
      })
      .catch(() => {});
  }

  const avg = computeAverages(profile);

  const rank = rankForPoints(player.rankPoints);
  const nr = nextRank(player.rankPoints);
  const level = levelForXp(player.xp);
  const xpInfo = xpProgress(player.xp);

  return NextResponse.json({
    player: {
      id: player.id,
      username: player.username,
      avatarSeed: player.avatarSeed,
      xp: player.xp,
      level,
      rankPoints: player.rankPoints,
      rank: rank.tier,
      rankLabel: rank.label,
      rankColor: rank.color,
      nextRank: nr ? nr.tier : null,
      pointsToNextRank: nr ? nr.minPoints - player.rankPoints : 0,
      xpIntoLevel: xpInfo.intoLevel,
      xpForLevel: xpInfo.needed,
    },
    streaks: {
      current: liveStreak,
      longest: Math.max(profile.longestStreak, liveStreak),
      winStreak: profile.winStreak,
      freezeCount: streakFreeze.count,
      dailyHistory: history.slice(-14),
    },
    record: {
      totalGames: profile.totalGames,
      wins: profile.wins,
      losses: profile.losses,
      draws: profile.draws,
      winRate: avg.winRate,
      avgGuesses: avg.avgGuesses,
      avgTimeMs: avg.avgTimeMs,
      bestTimeMs: profile.bestTimeMs,
      favoriteFirstWord: fav,
      duelWins: profile.duelWins,
      duelLosses: profile.duelLosses,
    },
    distribution: {
      1: profile.dist1,
      2: profile.dist2,
      3: profile.dist3,
      4: profile.dist4,
      5: profile.dist5,
      6: profile.dist6,
    },
    achievements,
    recentGames,
  });
}
