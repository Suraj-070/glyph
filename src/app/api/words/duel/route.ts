// POST /api/words/duel — duel session token. Word derived DETERMINISTICALLY
// from shared wordSeed (both players compute same word). 0 DB queries.
import { NextResponse } from "next/server";
import { signGameToken, duelWordFromSeed } from "@/lib/game-token";
import { getPool } from "@/lib/words";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { wordSeed?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const wordSeed = (body.wordSeed || "").toString().trim();
  if (!wordSeed || wordSeed.length < 3) {
    return NextResponse.json({ error: "Missing wordSeed" }, { status: 400 });
  }
  const token = signGameToken({
    seed: `L-${wordSeed}`,
    word: duelWordFromSeed(wordSeed, getPool("duel")),
    mode: "duel",
    maxGuesses: 6,
    guessesUsed: 0,
    won: false,
    finished: false,
    createdAt: Date.now(),
  });
  return NextResponse.json({ token, mode: "duel", maxGuesses: 6, wordLength: 5 });
}
