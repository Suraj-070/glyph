"use client";
// Phase 1 fairness: survive refresh + connection loss.
// - sessionStorage snapshot: in-progress game (token + revealed guesses) per mode
// - localStorage queue: finished-but-unsubmitted games, flushed when back online
import { api } from "@/lib/api";
import type { GuessResult } from "@/hooks/use-wordle-game";

const SNAP_PREFIX = "glyph-game-";
const QUEUE_KEY = "glyph-pending-submits";

export interface GameSnapshot {
  token: string;
  guesses: GuessResult[];
  startedAt: number;
  maxGuesses: number;
  dailyDate?: string;
  savedAt: number;
}

const SNAP_TTL_MS = 1000 * 60 * 60 * 20; // < token TTL

export function saveSnapshot(mode: string, snap: Omit<GameSnapshot, "savedAt">): void {
  try {
    sessionStorage.setItem(SNAP_PREFIX + mode, JSON.stringify({ ...snap, savedAt: Date.now() }));
  } catch { /* storage full/blocked — non-fatal */ }
}

export function loadSnapshot(mode: string): GameSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAP_PREFIX + mode);
    if (!raw) return null;
    const snap = JSON.parse(raw) as GameSnapshot;
    if (Date.now() - snap.savedAt > SNAP_TTL_MS) {
      clearSnapshot(mode);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

export function clearSnapshot(mode: string): void {
  try { sessionStorage.removeItem(SNAP_PREFIX + mode); } catch { /* */ }
}

// ---- pending submit queue (XP never lost) ----

interface PendingSubmit {
  token: string;
  mode: string;
  guesses: { text: string; result: string; attempt: number }[];
  queuedAt: number;
}

function readQueue(): PendingSubmit[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as PendingSubmit[];
  } catch {
    return [];
  }
}

function writeQueue(q: PendingSubmit[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-10))); } catch { /* */ }
}

export function queueSubmit(p: Omit<PendingSubmit, "queuedAt">): void {
  const q = readQueue();
  if (q.some((x) => x.token === p.token)) return; // dedupe
  q.push({ ...p, queuedAt: Date.now() });
  writeQueue(q);
}

let flushing = false;

/** Retry queued submits. Server-side seed dedupe makes double-flush harmless. */
export async function flushPendingSubmits(onSuccess?: () => void): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const q = readQueue();
    if (!q.length) return;
    const remaining: PendingSubmit[] = [];
    let anySucceeded = false;
    for (const p of q) {
      try {
        await api("/api/game/submit", {
          method: "POST",
          body: JSON.stringify({ token: p.token, mode: p.mode, guesses: p.guesses }),
        });
        anySucceeded = true;
      } catch (e) {
        // 409 = already submitted (dedupe hit) — drop it. Network error — keep for later.
        const status = (e as Error & { status?: number }).status;
        if (status === undefined) remaining.push(p);            // network — retry later
        else if (status !== 409 && status !== 404) remaining.push(p);
      }
    }
    writeQueue(remaining);
    if (anySucceeded) onSuccess?.();
  } finally {
    flushing = false;
  }
}

/** Wire flush to app lifecycle: on load + when connection returns. */
export function installSubmitFlusher(onSuccess?: () => void): () => void {
  void flushPendingSubmits(onSuccess);
  const handler = () => void flushPendingSubmits(onSuccess);
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
