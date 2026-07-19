// POST /api/game/submit — record a completed game, update stats/streak/XP/achievements.
// SERVER-AUTHORITATIVE: won / guessesUsed / duration come from the WordSession
// (written by /api/words/validate), never trusted from the client.
// Sessions are single-use (consumed flag) so a game can't be submitted twice.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";
import { verifyGameToken } from "@/lib/game-token";
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
    token: string;
    mode: string;
    opponentName?: string;
    roomId?: string;
    guesses?: GuessInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const session = verifyGameToken((body.token || "").toString());
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 404 });
  }
  if (!session.finished) {
    return NextResponse.json({ error: "Game not finished" }, { status: 409 });
  }

  // Single-use dedupe: insert seed row; unique PK violation = already submitted.
  const [player, consumed] = await Promise.all([
    getCurrentPlayer(),
    db.wordSession
      .create({
        data: {
          seed: session.seed,
          word: session.word,
          mode: session.mode,
          maxGuesses: session.maxGuesses,
          guessesUsed: session.guessesUsed,
          won: session.won,
          finished: true,
          consumed: true,
        },
      })
      .then(() => true)
      .catch(() => false),
  ]);
  if (!consumed) {
    return NextResponse.json({ error: "Game already submitted" }, { status: 409 });
  }

  // Authoritative values from the signed token — client claims ignored.
  const won = session.won;
  const guessesUsed = session.guessesUsed;
  // BUG FIX #8: cap by server elapsed but use body.durationMs when provided and reasonable.
  // session.createdAt = when token was issued (page load), not when user started guessing.
  const serverElapsed = Math.max(0, Date.now() - session.createdAt);
  const clientMs = typeof (body as Record<string, unknown>).durationMs === "number"
    ? Math.max(0, (body as unknown as { durationMs: number }).durationMs)
    : null;
  const durationMs = clientMs !== null
    ? Math.min(clientMs, serverElapsed, 1000 * 60 * 60 * 6)
    : Math.min(serverElapsed, 1000 * 60 * 60 * 6);

  const mode = ["classic", "practice", "duel", "party", "challenge"].includes(body.mode)
    ? body.mode
    : session.mode;

  const isDaily = mode === "classic" && !!session.dailyDate;
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
    mode,
    dailyType,
    durationMs,
  });
  const rankDelta = computeRankPoints({ won, guessesUsed, mode });

  // Sanitize client-echoed guesses (display-only replay data): must match count.
  const guesses =
    body.guesses?.length === guessesUsed
      ? body.guesses.slice(0, session.maxGuesses).map((g, i) => ({
          text: (g.text || "").toString().slice(0, 5).toUpperCase(),
          result: (g.result || "").toString().slice(0, 5),
          attempt: i + 1,
        }))
      : [];

  const game = await db.game.create({
    data: {
      playerId: player.id,
      mode,
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
      guesses: guesses.length ? { create: guesses } : undefined,
    },
  });

  // Update profile counters
  const distField =
    guessesUsed >= 1 && guessesUsed <= 6
      ? (`dist${guessesUsed}` as "dist1" | "dist2" | "dist3" | "dist4" | "dist5" | "dist6")
      : null;

  const profileUpdatePromise = db.playerProfile.update({
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
      ...(won && mode === "duel"
        ? { duelWins: { increment: 1 } }
        : !won && mode === "duel"
        ? { duelLosses: { increment: 1 } }
        : {}),
      ...(distField ? { [distField]: { increment: 1 } } : {}),
    },
  });

  const xpUpdatePromise = db.player.update({
    where: { id: player.id },
    data: {
      xp: { increment: xpEarned },
      rankPoints: { increment: rankDelta },
      status: "online",
    },
  });

  const winStreakPromise =
    mode === "duel"
      ? db.playerProfile.update({
          where: { playerId: player.id },
          data: { winStreak: won ? (profile.winStreak ?? 0) + 1 : 0 },
        })
      : Promise.resolve(null);

  const aggregatePromise =
    isDaily && dailyDate
      ? db.dailyChallenge
          .upsert({
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
          })
          .catch(() => null)
      : Promise.resolve(null);

  const [updatedProfile] = await Promise.all([
    profileUpdatePromise,
    xpUpdatePromise,
    winStreakPromise,
    aggregatePromise,
  ]);

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

  const updatedPlayer = await syncPlayerLevel(player.id);

  // Achievements
  const duelWins = won && mode === "duel" ? (profile.duelWins ?? 0) + 1 : profile.duelWins ?? 0;
  const unlocked = await grantAchievements(player.id, {
    won,
    guessesUsed,
    durationMs,
    mode,
    currentStreak,
    duelWins,
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
