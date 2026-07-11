// GET /api/words/practice — returns a new practice word session (opaque seed)
import { NextResponse } from "next/server";
import { createPracticeSession } from "@/lib/word-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = createPracticeSession();
  return NextResponse.json({
    seed: session.seed,
    mode: "practice",
    maxGuesses: session.maxGuesses,
    wordLength: 5,
  });
}
