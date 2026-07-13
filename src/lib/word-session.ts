// GLYPH — server-side word session manager (DB-backed, serverless-safe)
// Secret words live ONLY in the WordSession table, keyed by an opaque seed.
// Clients never receive the raw word during play; they submit guesses to
// /api/words/validate which evaluates server-side and records the outcome.
import { db } from "./db";
import { randomFromPool, dailyWordForDate, dailyTypeForDate } from "./words";
import { randomUUID } from "crypto";

export interface WordSession {
  seed: string;
  word: string;
  mode: string; // classic | practice | duel
  dailyType?: string | null;
  dailyDate?: string | null;
  maxGuesses: number;
  guessesUsed: number;
  won: boolean;
  finished: boolean;
  consumed: boolean;
  createdAt: Date;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24; // 24h

function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function genSeed(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
}

/** Best-effort prune: fire-and-forget, ~2% sampled — never blocks the hot path. */
function pruneExpiredAsync(): void {
  if (Math.random() > 0.02) return;
  db.wordSession
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - SESSION_TTL_MS) } } })
    .catch(() => {});
}

export async function createDailySession(): Promise<WordSession> {
  pruneExpiredAsync();
  const now = new Date();
  const word = dailyWordForDate(now);
  const dailyType = dailyTypeForDate(now);
  const maxGuesses = dailyType === "hardcore" ? 4 : 6;
  const seed = `D-${todayStr(now)}-${genSeed()}`;
  return db.wordSession.create({
    data: { seed, word, mode: "classic", dailyType, dailyDate: todayStr(now), maxGuesses },
  });
}

export async function createPracticeSession(): Promise<WordSession> {
  pruneExpiredAsync();
  return db.wordSession.create({
    data: { seed: `P-${genSeed()}`, word: randomFromPool("daily-normal"), mode: "practice", maxGuesses: 6 },
  });
}

// Duel: both players share the same wordSeed from the socket server.
// First caller creates the word; the opponent's call returns the SAME word.
export async function createOrGetDuelSession(wordSeed: string): Promise<WordSession> {
  const seed = `L-${wordSeed}`;
  const existing = await db.wordSession.findUnique({ where: { seed } });
  if (existing) return existing;
  try {
    return await db.wordSession.create({
      data: { seed, word: randomFromPool("duel"), mode: "duel", maxGuesses: 6 },
    });
  } catch {
    // race: opponent created it first — unique constraint means one word wins
    const s = await db.wordSession.findUnique({ where: { seed } });
    if (!s) throw new Error("Duel session create failed");
    return s;
  }
}

export async function getSession(seed: string): Promise<WordSession | null> {
  if (!seed) return null;
  const s = await db.wordSession.findUnique({ where: { seed } });
  if (!s) return null;
  if (Date.now() - s.createdAt.getTime() > SESSION_TTL_MS) return null;
  return s;
}

/**
 * Record a validated guess outcome on the session (server-authoritative).
 * Returns updated session or null if already finished.
 */
export async function recordGuess(
  session: WordSession,
  won: boolean
): Promise<WordSession> {
  if (session.finished) return session;
  const guessesUsed = session.guessesUsed + 1;
  const finished = won || guessesUsed >= session.maxGuesses;
  return db.wordSession.update({
    where: { seed: session.seed },
    data: { guessesUsed, won, finished },
  });
}

/** Mark session consumed by /api/game/submit (single-use). */
export async function consumeSession(seed: string): Promise<WordSession | null> {
  try {
    return await db.wordSession.update({
      where: { seed, consumed: false },
      data: { consumed: true },
    });
  } catch {
    return null; // already consumed or missing
  }
}

export async function revealWord(seed: string): Promise<string | null> {
  const s = await getSession(seed);
  return s?.word ?? null;
}

export function todayDateStr(): string {
  return todayStr();
}
