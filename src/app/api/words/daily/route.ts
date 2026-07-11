// GET /api/words/daily — returns today's daily challenge metadata + opaque seed.
// NEVER reveals the secret word.
import { NextResponse } from "next/server";
import { createDailySession, todayDateStr } from "@/lib/word-session";
import { dailyTypeForDate } from "@/lib/words";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = createDailySession();
  const now = new Date();
  const type = dailyTypeForDate(now);

  // global aggregate stats for today (best-effort)
  let globalPlays = 0;
  let globalWins = 0;
  let globalAvgGuesses = 0;
  try {
    const agg = await db.dailyChallenge.findUnique({ where: { date: session.dailyDate } });
    if (agg) {
      globalPlays = agg.totalPlays;
      globalWins = agg.totalWins;
      globalAvgGuesses = agg.totalPlays > 0 ? agg.totalGuessSum / agg.totalPlays : 0;
    }
  } catch {
    /* ignore */
  }

  // next-day countdown
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilNext = tomorrow.getTime() - now.getTime();

  return NextResponse.json({
    seed: session.seed,
    mode: "classic",
    dailyType: type,
    dailyDate: session.dailyDate,
    maxGuesses: session.maxGuesses,
    wordLength: 5,
    rewardXp: type === "hardcore" ? 260 : type === "challenge" ? 180 : 100,
    isChallengeDay: type !== "normal",
    countdownMs: msUntilNext,
    global: {
      plays: globalPlays,
      wins: globalWins,
      avgGuesses: Math.round(globalAvgGuesses * 10) / 10,
    },
  });
}
