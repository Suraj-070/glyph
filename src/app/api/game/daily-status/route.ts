// GET /api/game/daily-status — has the current player already finished today's daily?
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";

export const dynamic = "force-dynamic";

function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  const player = await getCurrentPlayer();
  const game = await db.game.findFirst({
    where: { playerId: player.id, isDaily: true, dailyDate: todayStr() },
    select: { won: true, guessesUsed: true, word: true, xpEarned: true },
  });
  return NextResponse.json({
    played: !!game,
    won: game?.won ?? false,
    guessesUsed: game?.guessesUsed ?? 0,
    word: game?.word ?? null,
    xpEarned: game?.xpEarned ?? 0,
  });
}
