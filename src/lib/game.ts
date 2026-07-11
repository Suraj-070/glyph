// GLYPH — core game logic (server-authoritative evaluation)
import type { GuessResult, TileStatus } from "./types";

/**
 * Evaluate a guess against the secret word.
 * Standard Wordle two-pass algorithm:
 *  1. mark correct letters (green)
 *  2. mark present letters (yellow) using remaining unmatched counts
 *  3. remaining are absent (gray)
 * Both inputs are uppercased & validated to length 5 by the caller.
 */
export function evaluateGuess(guess: string, secret: string): GuessResult {
  const g = guess.toUpperCase();
  const s = secret.toUpperCase();
  const statuses: TileStatus[] = new Array(g.length).fill("absent");
  const secretCounts: Record<string, number> = {};

  // Pass 1: correct positions
  for (let i = 0; i < g.length; i++) {
    if (g[i] === s[i]) {
      statuses[i] = "correct";
    } else {
      secretCounts[s[i]] = (secretCounts[s[i]] || 0) + 1;
    }
  }

  // Pass 2: present (wrong place)
  for (let i = 0; i < g.length; i++) {
    if (statuses[i] === "correct") continue;
    const ch = g[i];
    if (secretCounts[ch] > 0) {
      statuses[i] = "present";
      secretCounts[ch]--;
    }
  }

  return { guess: g, statuses };
}

/** Compact status string e.g. "cpaab" for storage. */
export function statusesToString(statuses: TileStatus[]): string {
  return statuses
    .map((s) => (s === "correct" ? "c" : s === "present" ? "p" : "a"))
    .join("");
}

export function stringToStatuses(s: string): TileStatus[] {
  return s.split("").map((c) =>
    c === "c" ? "correct" : c === "p" ? "present" : "absent"
  );
}

/** Compute keyboard hint state from a list of guesses. */
export function computeKeyStates(
  guesses: GuessResult[]
): Record<string, TileStatus> {
  const map: Record<string, TileStatus> = {};
  const order: TileStatus[] = ["absent", "present", "correct"];
  for (const { guess, statuses } of guesses) {
    for (let i = 0; i < guess.length; i++) {
      const ch = guess[i];
      const cur = map[ch];
      const next = statuses[i];
      if (!cur || order.indexOf(next) > order.indexOf(cur)) {
        map[ch] = next;
      }
    }
  }
  return map;
}

/** XP awarded for a finished game. */
export function computeXp(opts: {
  won: boolean;
  guessesUsed: number;
  maxGuesses: number;
  mode: string;
  dailyType?: string;
  durationMs: number;
}): number {
  if (!opts.won) return 20; // participation
  const speedBonus = Math.max(0, 120 - Math.floor(opts.durationMs / 1000));
  const efficiencyBonus = Math.max(0, (opts.maxGuesses - opts.guessesUsed) * 40);
  let base = 100;
  if (opts.mode === "duel") base = 180;
  if (opts.mode === "party") base = 150;
  if (opts.mode === "challenge") base = 220;
  if (opts.dailyType === "challenge") base += 80;
  if (opts.dailyType === "hardcore") base += 160;
  return base + speedBonus + efficiencyBonus;
}

/** Rank points awarded (competitive ranking). */
export function computeRankPoints(opts: {
  won: boolean;
  guessesUsed: number;
  mode: string;
}): number {
  if (!opts.won) return opts.mode === "duel" ? -12 : 4;
  let pts = 30;
  pts += Math.max(0, (7 - opts.guessesUsed) * 8);
  if (opts.mode === "duel") pts += 25;
  if (opts.mode === "challenge") pts += 15;
  return pts;
}

/** Maximum guesses per mode. */
export function maxGuessesFor(mode: string, dailyType?: string): number {
  if (dailyType === "hardcore") return 4;
  return 6;
}
