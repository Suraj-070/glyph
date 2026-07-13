// GET /api/words/daily — today's challenge as a signed token + global stats.
import { NextResponse } from "next/server";
import { signGameToken, newSeed } from "@/lib/game-token";
import { dailyWordForDate, dailyTypeForDate } from "@/lib/words";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  const now = new Date();
  const type = dailyTypeForDate(now);
  const dailyDate = todayStr(now);
  const maxGuesses = type === "hardcore" ? 4 : 6;

  const token = signGameToken({
    seed: newSeed(`D-${dailyDate}`),
    word: dailyWordForDate(now),
    mode: "classic",
    dailyType: type,
    dailyDate,
    maxGuesses,
    guessesUsed: 0,
    won: false,
    finished: false,
    createdAt: Date.now(),
  });

  let globalPlays = 0, globalWins = 0, globalAvgGuesses = 0;
  try {
    const agg = await db.dailyChallenge.findUnique({ where: { date: dailyDate } });
    if (agg) {
      globalPlays = agg.totalPlays;
      globalWins = agg.totalWins;
      globalAvgGuesses = agg.totalPlays > 0 ? agg.totalGuessSum / agg.totalPlays : 0;
    }
  } catch { /* best effort */ }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return NextResponse.json({
    token,
    mode: "classic",
    dailyType: type,
    dailyDate,
    maxGuesses,
    wordLength: 5,
    rewardXp: type === "hardcore" ? 260 : type === "challenge" ? 180 : 100,
    isChallengeDay: type !== "normal",
    countdownMs: tomorrow.getTime() - now.getTime(),
    global: {
      plays: globalPlays,
      wins: globalWins,
      avgGuesses: Math.round(globalAvgGuesses * 10) / 10,
    },
  });
}
