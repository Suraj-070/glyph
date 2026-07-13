// GLYPH — client-side API helpers
"use client";

export async function api<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && String((data as Record<string, unknown>).error)) ||
      `Request failed (${res.status})`;
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/** True when a caught error is a network failure (offline / DNS / aborted). */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && e.message === "Failed to fetch");
}

/** True when a caught api() error carries the given HTTP status. */
export function hasStatus(e: unknown, status: number): boolean {
  return e instanceof Error && (e as Error & { status?: number }).status === status;
}

export function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

// Deterministic gradient avatar color pair from a seed string
export function avatarGradient(seed: string): [string, string] {
  const palettes: [string, string][] = [
    ["#2dd4bf", "#0ea5e9"],
    ["#a78bfa", "#ec4899"],
    ["#fbbf24", "#f97316"],
    ["#34d399", "#10b981"],
    ["#f472b6", "#a855f7"],
    ["#60a5fa", "#22d3ee"],
    ["#fb7185", "#f59e0b"],
    ["#c084fc", "#818cf8"],
    ["#4ade80", "#22c55e"],
    ["#facc15", "#fb923c"],
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

export function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function statusColor(status: string): string {
  switch (status) {
    case "online":
      return "#34d399";
    case "playing":
      return "#2dd4bf";
    case "idle":
      return "#fbbf24";
    default:
      return "#64748b";
  }
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
