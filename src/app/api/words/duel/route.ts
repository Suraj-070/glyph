// POST /api/words/duel — get-or-create a duel word session from a shared wordSeed.
// Both players POST the same wordSeed (issued by the socket server) and receive
// the SAME opaque seed -> same secret word (kept server-side).
import { NextResponse } from "next/server";
import { createOrGetDuelSession } from "@/lib/word-session";

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
  const session = createOrGetDuelSession(wordSeed);
  return NextResponse.json({
    seed: session.seed,
    mode: "duel",
    maxGuesses: session.maxGuesses,
    wordLength: 5,
  });
}
