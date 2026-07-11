// POST /api/words/practice/reveal — reveals the secret word for a PRACTICE session only.
// Used so the AI hint endpoint can be called during practice (non-competitive).
// NEVER allowed for classic/daily or duel sessions — those return 403.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/word-session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { seed?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const seed = (body.seed || "").toString().trim();
  const session = getSession(seed);
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 404 });
  }
  if (session.mode !== "practice") {
    // hard security gate: only practice sessions can be revealed mid-game
    return NextResponse.json(
      { error: "Reveal not permitted for this mode" },
      { status: 403 }
    );
  }
  return NextResponse.json({ word: session.word });
}
