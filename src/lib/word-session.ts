// GLYPH — server-side word session manager
// Secret words live ONLY here (in-memory), keyed by an opaque seed token.
// Clients never receive the raw word during play; they get a seed and submit
// guesses to /api/words/validate which returns color results.
import { randomAnswer, dailyWordForDate, dailyTypeForDate } from "./words";

export interface WordSession {
  seed: string;
  word: string;
  mode: string; // classic | practice | duel
  dailyType?: string;
  dailyDate?: string;
  maxGuesses: number;
  createdAt: number;
}

// Persist across hot reloads in dev
const g = globalThis as unknown as {
  __glyphSessions?: Map<string, WordSession>;
};
const sessions: Map<string, WordSession> =
  g.__glyphSessions ?? (g.__glyphSessions = new Map());

function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function genSeed(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  ).toUpperCase();
}

export function createDailySession(): WordSession {
  const now = new Date();
  const word = dailyWordForDate(now);
  const dailyType = dailyTypeForDate(now);
  const maxGuesses = dailyType === "hardcore" ? 4 : 6;
  const seed = `D-${todayStr(now)}-${genSeed()}`;
  const session: WordSession = {
    seed,
    word,
    mode: "classic",
    dailyType,
    dailyDate: todayStr(now),
    maxGuesses,
    createdAt: Date.now(),
  };
  sessions.set(seed, session);
  return session;
}

export function createPracticeSession(): WordSession {
  const word = randomAnswer();
  const seed = `P-${genSeed()}`;
  const session: WordSession = {
    seed,
    word,
    mode: "practice",
    maxGuesses: 6,
    createdAt: Date.now(),
  };
  sessions.set(seed, session);
  return session;
}

// Duel: both players share the same wordSeed from the socket server.
// First caller creates the word; the opponent's call returns the SAME word.
const duelWords = new Map<string, string>();
export function createOrGetDuelSession(wordSeed: string): WordSession {
  let word = duelWords.get(wordSeed);
  if (!word) {
    word = randomAnswer();
    duelWords.set(wordSeed, word);
  }
  const seed = `L-${wordSeed}`;
  // reuse a single session per wordSeed
  const existing = sessions.get(seed);
  if (existing) return existing;
  const session: WordSession = {
    seed,
    word,
    mode: "duel",
    maxGuesses: 6,
    createdAt: Date.now(),
  };
  sessions.set(seed, session);
  return session;
}

export function getSession(seed: string): WordSession | null {
  return sessions.get(seed) ?? null;
}

export function revealWord(seed: string): string | null {
  return sessions.get(seed)?.word ?? null;
}

export function todayDateStr(): string {
  return todayStr();
}
