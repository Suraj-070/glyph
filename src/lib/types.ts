// GLYPH — shared types

export type GameMode = "classic" | "practice" | "duel" | "party" | "challenge";
export type DailyType = "normal" | "challenge" | "hardcore";
export type TileStatus = "correct" | "present" | "absent" | "empty" | "tbd";
export type PlayerStatus = "online" | "idle" | "playing" | "offline";

export interface GuessResult {
  guess: string;
  statuses: TileStatus[];
}

export interface OpponentProgressRow {
  // colors only — NEVER the letters
  statuses: TileStatus[];
  // whether this row is finalized (submitted) or still being typed
  final: boolean;
}

export interface OpponentState {
  id: string;
  name: string;
  avatarSeed: string;
  status: PlayerStatus;
  rows: OpponentProgressRow[];
  currentAttempt: number;
  won: boolean;
  lost: boolean;
  finishedAt?: number;
  finishTimeMs?: number;
  // typing indicator
  typing: boolean;
}

export interface RankInfo {
  tier: string;
  label: string;
  minPoints: number;
  color: string; // tailwind/hex
}

export const RANKS: RankInfo[] = [
  { tier: "beginner", label: "Beginner", minPoints: 0, color: "#94a3b8" },
  { tier: "bronze", label: "Bronze", minPoints: 300, color: "#cd7f32" },
  { tier: "silver", label: "Silver", minPoints: 900, color: "#c0c0c0" },
  { tier: "gold", label: "Gold", minPoints: 1800, color: "#fbbf24" },
  { tier: "platinum", label: "Platinum", minPoints: 3200, color: "#2dd4bf" },
  { tier: "diamond", label: "Diamond", minPoints: 5000, color: "#67e8f9" },
  { tier: "master", label: "Master", minPoints: 8000, color: "#c084fc" },
];

export function rankForPoints(points: number): RankInfo {
  let r = RANKS[0];
  for (const rank of RANKS) {
    if (points >= rank.minPoints) r = rank;
  }
  return r;
}

export function nextRank(points: number): RankInfo | null {
  for (const rank of RANKS) {
    if (points < rank.minPoints) return rank;
  }
  return null;
}

export function levelForXp(xp: number): number {
  // each level needs progressively more xp
  let level = 1;
  let need = 200;
  let acc = 0;
  while (xp >= acc + need) {
    acc += need;
    level++;
    need = Math.round(need * 1.18);
  }
  return level;
}

export function xpProgress(xp: number): { current: number; needed: number; intoLevel: number } {
  let level = 1;
  let need = 200;
  let acc = 0;
  while (xp >= acc + need) {
    acc += need;
    level++;
    need = Math.round(need * 1.18);
  }
  return { current: xp - acc, needed: need, intoLevel: xp - acc };
}
