// GLYPH — word data layer (server-only)
// Loads database/ JSON at module init. NEVER import from client components —
// answer pools would ship in the bundle and be scrapeable.
import answersJson from "@/../database/core/answers.json";
import dictionaryJson from "@/../database/core/dictionary.json";
import poolNormal from "@/../database/pools/daily-normal.json";
import poolChallenge from "@/../database/pools/daily-challenge.json";
import poolHardcore from "@/../database/pools/daily-hardcore.json";
import poolDuel from "@/../database/pools/duel.json";
import poolParty from "@/../database/pools/party.json";
import statsJson from "@/../database/meta/stats.json";
import overridesJson from "@/../database/schedule/daily-overrides.json";

export type DailyType = "normal" | "challenge" | "hardcore";
export type PoolName = "daily-normal" | "daily-challenge" | "daily-hardcore" | "duel" | "party";

const ANSWERS: string[] = answersJson as string[];
const VALID_SET = new Set<string>(dictionaryJson as string[]);

const POOLS: Record<PoolName, string[]> = {
  "daily-normal": poolNormal as string[],
  "daily-challenge": poolChallenge as string[],
  "daily-hardcore": poolHardcore as string[],
  duel: poolDuel as string[],
  party: poolParty as string[],
};

export const WORD_STATS = statsJson as Record<string, { vowels: number; unique: number }>;

const OVERRIDES = overridesJson as Record<string, { word: string; type?: DailyType }>;

// ---- validation (hot path: every guess) ----

export function isValidWord(word: string): boolean {
  return VALID_SET.has(word.toUpperCase());
}

// ---- picking ----

function pickFrom(pool: string[], exclude?: string): string {
  let w = pool[Math.floor(Math.random() * pool.length)];
  if (exclude) {
    let guard = 0;
    while (w === exclude && guard < 10) {
      w = pool[Math.floor(Math.random() * pool.length)];
      guard++;
    }
  }
  return w;
}

/** Direct pool access (server-only). */
export function getPool(pool: PoolName): string[] {
  const p = POOLS[pool];
  return p?.length ? p : ANSWERS;
}

/** Random word from a mode pool. Falls back to full answer list. */
export function randomFromPool(pool: PoolName, exclude?: string): string {
  const p = POOLS[pool];
  return pickFrom(p?.length ? p : ANSWERS, exclude);
}

/** Legacy API: random answer (kept for compatibility; prefer randomFromPool). */
export function randomAnswer(exclude?: string): string {
  return pickFrom(ANSWERS, exclude);
}

// ---- daily (deterministic + override-aware) ----

function dateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Daily challenge type rotation (normal / challenge / hardcore), override-aware. */
export function dailyTypeForDate(date: Date): DailyType {
  const ov = OVERRIDES[dateStr(date)];
  if (ov?.type) return ov.type;
  const day = date.getDay(); // 0 Sun .. 6 Sat
  if (day === 5) return "hardcore";
  if (day === 2 || day === 4) return "challenge";
  return "normal";
}

/**
 * Deterministic daily word: same for every player, server-side authoritative.
 * Picked from the pool matching the day's type; schedule/daily-overrides.json
 * can pin an exact word for a date (holidays/events) without code changes.
 */
export function dailyWordForDate(date: Date): string {
  const ds = dateStr(date);
  const ov = OVERRIDES[ds];
  if (ov?.word && VALID_SET.has(ov.word.toUpperCase())) {
    return ov.word.toUpperCase();
  }
  const type = dailyTypeForDate(date);
  const pool =
    type === "hardcore"
      ? POOLS["daily-hardcore"]
      : type === "challenge"
      ? POOLS["daily-challenge"]
      : POOLS["daily-normal"];
  const src = pool.length ? pool : ANSWERS;
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  // multiply by large prime so consecutive days don't walk the sorted pool alphabetically
  const idx = (seed * 2654435761) % src.length;
  return src[idx];
}
