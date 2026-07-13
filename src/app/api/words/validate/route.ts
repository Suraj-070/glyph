// POST /api/words/validate — STATELESS server-authoritative guess evaluation.
// Body: { token, guess }
// ZERO database queries: session state travels in an encrypted, HMAC-signed
// token. Response includes the next token. Word never readable client-side.
import { NextResponse } from "next/server";
import { verifyGameToken, signGameToken } from "@/lib/game-token";
import { evaluateGuess, statusesToString } from "@/lib/game";
import { isValidWord } from "@/lib/words";
import type { TileStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { token?: string; guess?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const guess = (body.guess || "").toString().trim().toUpperCase();
  const state = verifyGameToken((body.token || "").toString());

  if (!state) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 404 });
  }
  if (state.finished) {
    return NextResponse.json({ error: "Game already finished" }, { status: 409 });
  }
  if (guess.length !== 5 || !/^[A-Z]+$/.test(guess)) {
    return NextResponse.json({ error: "Guess must be 5 letters" }, { status: 400 });
  }
  if (!isValidWord(guess)) {
    return NextResponse.json({ error: "Not in word list", invalid: true }, { status: 422 });
  }

  const result = evaluateGuess(guess, state.word);
  const won = result.guess === state.word.toUpperCase();
  const guessesUsed = state.guessesUsed + 1;
  const finished = won || guessesUsed >= state.maxGuesses;

  const next = signGameToken({ ...state, guessesUsed, won, finished });

  const payload: {
    statuses: TileStatus[];
    guess: string;
    result: string;
    won: boolean;
    finished: boolean;
    attempt: number;
    token: string;
    word?: string;
  } = {
    statuses: result.statuses,
    guess: result.guess,
    result: statusesToString(result.statuses),
    won,
    finished,
    attempt: guessesUsed,
    token: next,
  };
  if (finished) payload.word = state.word;

  return NextResponse.json(payload);
}
