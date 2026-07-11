// GLYPH — stats, streak, achievement helpers (server-side)
import { db } from "./db";
import { levelForXp } from "./types";

export interface DailyWinRecord {
  date: string;
  won: boolean;
}

/** Get the player's daily history (date, won) sorted ascending. */
export async function getDailyHistory(playerId: string): Promise<DailyWinRecord[]> {
  const games = await db.game.findMany({
    where: { playerId, isDaily: true },
    select: { dailyDate: true, won: true },
    orderBy: { completedAt: "asc" },
  });
  const seen = new Map<string, boolean>();
  for (const g of games) {
    if (g.dailyDate) {
      // keep the best result per date (win over loss)
      const prev = seen.get(g.dailyDate);
      if (prev === undefined || (!prev && g.won)) seen.set(g.dailyDate, g.won);
    }
  }
  return Array.from(seen.entries())
    .map(([date, won]) => ({ date, won }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Recompute current streak from daily win history (consecutive wins ending today/yesterday). */
export function computeCurrentStreak(history: DailyWinRecord[]): number {
  if (history.length === 0) return 0;
  // build a map of date -> won
  const dateWon = new Map<string, boolean>();
  for (const h of history) dateWon.set(h.date, h.won);
  const winDates = new Set(
    history.filter((h) => h.won).map((h) => h.date)
  );
  const today = new Date();
  const todayStr = fmt(today);

  // If the player lost today, the streak is broken.
  if (dateWon.has(todayStr) && !winDates.has(todayStr)) return 0;

  let streak = 0;
  const cursor = new Date(today);
  // if today not yet won, start from yesterday so the streak survives until end of day
  if (!winDates.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (winDates.has(fmt(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface AchievementCheck {
  type: string;
}

/** Check & grant achievements after a finished game. Returns newly unlocked types. */
export async function grantAchievements(
  playerId: string,
  ctx: {
    won: boolean;
    guessesUsed: number;
    durationMs: number;
    mode: string;
    currentStreak: number;
    duelWins: number;
  }
): Promise<string[]> {
  const unlocked: string[] = [];
  const tryUnlock = async (type: string, cond: boolean) => {
    if (!cond) return;
    try {
      await db.achievement.upsert({
        where: { playerId_type: { playerId, type } },
        update: {},
        create: { playerId, type },
      });
      unlocked.push(type);
    } catch {
      /* already exists */
    }
  };

  if (ctx.won) {
    await tryUnlock("first_win", true);
    await tryUnlock("sharpshooter", ctx.guessesUsed <= 2);
    await tryUnlock("speed_demon", ctx.durationMs > 0 && ctx.durationMs < 30000);
    await tryUnlock("streak_7", ctx.currentStreak >= 7);
    await tryUnlock("streak_30", ctx.currentStreak >= 30);
    await tryUnlock("streak_100", ctx.currentStreak >= 100);
    await tryUnlock("duel_master", ctx.duelWins >= 10);
    await tryUnlock("wordsmith", ctx.guessesUsed === 1);
  }
  return unlocked;
}

/** Recompute & persist player level from xp. */
export async function syncPlayerLevel(playerId: string): Promise<void> {
  const p = await db.player.findUnique({ where: { id: playerId } });
  if (!p) return;
  const level = levelForXp(p.xp);
  if (level !== p.level) {
    await db.player.update({ where: { id: playerId }, data: { level } });
  }
}

/** Aggregate profile stats: avg guesses, win rate, etc. (computed from profile counters) */
export function computeAverages(profile: {
  totalGames: number;
  wins: number;
  totalGuesses: number;
  totalDurationMs: number;
}) {
  const winRate = profile.totalGames > 0 ? (profile.wins / profile.totalGames) * 100 : 0;
  const avgGuesses = profile.totalGames > 0 ? profile.totalGuesses / profile.totalGames : 0;
  const avgTimeMs = profile.totalGames > 0 ? profile.totalDurationMs / profile.totalGames : 0;
  return { winRate, avgGuesses, avgTimeMs };
}

/** Favorite first word: most common first guess across the player's games. */
export async function favoriteFirstWord(playerId: string): Promise<string | null> {
  const firstGuesses = await db.guess.findMany({
    where: { game: { playerId }, attempt: 1 },
    select: { text: true },
  });
  if (firstGuesses.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const g of firstGuesses) {
    counts[g.text] = (counts[g.text] || 0) + 1;
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [w, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = w;
      bestN = n;
    }
  }
  return best;
}
