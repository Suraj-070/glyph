// GET /api/words/practice — new practice session as a signed token. 0 DB queries.
import { NextResponse } from "next/server";
import { signGameToken, newSeed } from "@/lib/game-token";
import { randomFromPool } from "@/lib/words";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = signGameToken({
    seed: newSeed("P"),
    word: randomFromPool("daily-normal"),
    mode: "practice",
    maxGuesses: 6,
    guessesUsed: 0,
    won: false,
    finished: false,
    createdAt: Date.now(),
  });
  return NextResponse.json({ token, mode: "practice", maxGuesses: 6, wordLength: 5 });
}
