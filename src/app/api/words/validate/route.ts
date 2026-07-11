// POST /api/words/validate — server-authoritative guess evaluation.
// Body: { seed, guess, attempt }
// Returns: { statuses, guess, won, finished, word?(only when finished) }
// The secret word is NEVER sent while the game is still in progress.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/word-session";
import { evaluateGuess, statusesToString } from "@/lib/game";
import { isValidWord } from "@/lib/words";
import type { TileStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { seed?: string; guess?: string; attempt?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const seed = (body.seed || "").toString().trim();
  const guess = (body.guess || "").toString().trim().toUpperCase();
  const attempt = Number(body.attempt) || 0;

  const session = getSession(seed);
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 404 });
  }
  if (guess.length !== 5 || !/^[A-Z]+$/.test(guess)) {
    return NextResponse.json({ error: "Guess must be 5 letters" }, { status: 400 });
  }
  if (!isValidWord(guess)) {
    return NextResponse.json(
      { error: "Not in word list", invalid: true },
      { status: 422 }
    );
  }

  const result = evaluateGuess(guess, session.word);
  const won = result.guess === session.word;
  const finished = won || attempt >= session.maxGuesses;

  const payload: {
    statuses: TileStatus[];
    guess: string;
    result: string;
    won: boolean;
    finished: boolean;
    word?: string;
  } = {
    statuses: result.statuses,
    guess: result.guess,
    result: statusesToString(result.statuses),
    won,
    finished,
  };

  // Only reveal the word when the game is definitively over.
  if (finished) {
    payload.word = session.word;
  }

  return NextResponse.json(payload);
}
