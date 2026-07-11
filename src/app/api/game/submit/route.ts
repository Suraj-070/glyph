// POST /api/game/submit — record a completed game, update stats/streak/XP/achievements.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";
import { getSession } from "@/lib/word-session";
import { computeXp, computeRankPoints } from "@/lib/game";
import {
  getDailyHistory,
  computeCurrentStreak,
  grantAchievements,
  syncPlayerLevel,
} from "@/lib/stats";
import { dailyTypeForDate } from "@/lib/words";
import { levelForXp, rankForPoints } from "@/lib/types";

export const dynamic = "force-dynamic";

interface GuessInput {
  text: string;
  result: string;
  attempt: number;
}

export async function POST(req: Request) {
  let body: {
    seed: string;
    mode: string;
    guessesUsed: number;
    won: boolean;
    durationMs: number;
    opponentName?: string;
    roomId?: string;
    guesses?: GuessInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const player = await getCurrentPlayer();
  const session = getSession(body.seed);
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 404 });
  }

  const isDaily = body.mode === "classic" && !!session.dailyDate;
  const dailyDate = session.dailyDate ?? null;
  const dailyType = session.dailyType ?? (isDaily ? dailyTypeForDate(new Date()) : "normal");

  // Prevent double-counting the daily challenge for the same day.
  if (isDaily && dailyDate) {
    const existing = await db.game.findFirst({
      where: { playerId: player.id, isDaily: true, dailyDate },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({
        alreadyPlayed: true,
        message: "You've already completed today's challenge.",
      });
    }
  }

  const won = !!body.won;
  const guessesUsed = Math.max(0, Math.min(session.maxGuesses, Number(body.guessesUsed) || 0));
  const durationMs = Math.max(0, Number(body.durationMs) || 0);

  // Ensure profile exists
  let profile = player.profile;
  if (!profile) {
    profile = await db.playerProfile.create({ data: { playerId: player.id } });
  }

  // XP & rank points (server-computed, authoritative)
  const xpEarned = computeXp({
    won,
    guessesUsed,
    maxGuesses: session.maxGuesses,
    mode: body.mode,
    dailyType,
    durationMs,
  });
  const rankDelta = computeRankPoints({ won, guessesUsed, mode: body.mode });

  // Create the game record
  const game = await db.game.create({
    data: {
      playerId: player.id,
      mode: body.mode,
      wordLength: 5,
      word: session.word, // stored for replay, never sent during play
      won,
      guessesUsed,
      durationMs,
      isDaily,
      dailyDate,
      roomId: body.roomId ?? null,
      opponentName: body.opponentName ?? null,
      xpEarned,
      guesses: body.guesses?.length
        ? {
            create: body.guesses.map((g) => ({
              text: g.text,
              result: g.result,
              attempt: g.attempt,
            })),
          }
        : undefined,
    },
  });

  // Update profile counters
  const distField =
    guessesUsed >= 1 && guessesUsed <= 6
      ? (`dist${guessesUsed}` as "dist1" | "dist2" | "dist3" | "dist4" | "dist5" | "dist6")
      : null;

  const updatedProfile = await db.playerProfile.update({
    where: { playerId: player.id },
    data: {
      totalGames: { increment: 1 },
      wins: { increment: won ? 1 : 0 },
      losses: { increment: !won ? 1 : 0 },
      totalGuesses: { increment: guessesUsed },
      totalDurationMs: { increment: durationMs },
      bestTimeMs:
        won && (profile.bestTimeMs === null || durationMs < profile.bestTimeMs)
          ? durationMs
          : profile.bestTimeMs,
      ...(won && body.mode === "duel"
        ? { duelWins: { increment: 1 } }
        : !won && body.mode === "duel"
        ? { duelLosses: { increment: 1 } }
        : {}),
      ...(distField ? { [distField]: { increment: 1 } } : {}),
    },
  });

  // Recompute streak (daily only changes it)
  let currentStreak = profile.currentStreak ?? 0;
  let longestStreak = profile.longestStreak ?? 0;
  if (isDaily) {
    const history = await getDailyHistory(player.id);
    currentStreak = computeCurrentStreak(history);
    longestStreak = Math.max(longestStreak, currentStreak);
    await db.playerProfile.update({
      where: { playerId: player.id },
      data: { currentStreak, longestStreak },
    });
  }

  // XP & rank points
  await db.player.update({
    where: { id: player.id },
    data: {
      xp: { increment: xpEarned },
      rankPoints: { increment: rankDelta },
      status: "online",
    },
  });
  await syncPlayerLevel(player.id);

  // Win streak (multiplayer)
  if (body.mode === "duel") {
    if (won) {
      const newWinStreak = (profile.winStreak ?? 0) + 1;
      await db.playerProfile.update({
        where: { playerId: player.id },
        data: { winStreak: newWinStreak },
      });
    } else {
      await db.playerProfile.update({
        where: { playerId: player.id },
        data: { winStreak: 0 },
      });
    }
  }

  // Daily challenge global aggregate
  if (isDaily && dailyDate) {
    try {
      await db.dailyChallenge.upsert({
        where: { date: dailyDate },
        update: {
          totalPlays: { increment: 1 },
          totalWins: { increment: won ? 1 : 0 },
          totalGuessSum: { increment: guessesUsed },
        },
        create: {
          date: dailyDate,
          word: session.word,
          type: dailyType,
          totalPlays: 1,
          totalWins: won ? 1 : 0,
          totalGuessSum: guessesUsed,
        },
      });
    } catch {
      /* ignore aggregate errors */
    }
  }

  // Achievements
  const duelWins = won && body.mode === "duel" ? (profile.duelWins ?? 0) + 1 : profile.duelWins ?? 0;
  const unlocked = await grantAchievements(player.id, {
    won,
    guessesUsed,
    durationMs,
    mode: body.mode,
    currentStreak,
    duelWins,
  });

  const updatedPlayer = await db.player.findUnique({
    where: { id: player.id },
    select: { xp: true, level: true, rankPoints: true },
  });

  return NextResponse.json({
    gameId: game.id,
    won,
    word: session.word, // reveal now that the game is over
    xpEarned,
    rankDelta,
    currentStreak,
    longestStreak,
    unlockedAchievements: unlocked,
    player: {
      xp: updatedPlayer?.xp ?? player.xp,
      level: updatedPlayer?.level ?? levelForXp(player.xp),
      rankPoints: updatedPlayer?.rankPoints ?? player.rankPoints,
      rank: rankForPoints(updatedPlayer?.rankPoints ?? player.rankPoints).tier,
    },
    profile: {
      totalGames: updatedProfile.totalGames,
      wins: updatedProfile.wins,
      losses: updatedProfile.losses,
      winRate:
        updatedProfile.totalGames > 0
          ? Math.round((updatedProfile.wins / updatedProfile.totalGames) * 1000) / 10
          : 0,
    },
    alreadyPlayed: false,
  });
}
