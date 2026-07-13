// POST /api/words/practice/reveal — reveal word for PRACTICE tokens only.
import { NextResponse } from "next/server";
import { verifyGameToken } from "@/lib/game-token";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const state = verifyGameToken((body.token || "").toString());
  if (!state) return NextResponse.json({ error: "Invalid session" }, { status: 404 });
  if (state.mode !== "practice") {
    return NextResponse.json({ error: "Reveal not permitted for this mode" }, { status: 403 });
  }
  return NextResponse.json({ word: state.word });
}
