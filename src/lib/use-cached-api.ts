"use client";
// Tiny stale-while-revalidate cache for tab data.
// Tab switch = instant render from memory cache, silent refresh in background.
// Kills the "every tab shows skeleton for 2s" problem without adding react-query.
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";

const cache = new Map<string, { data: unknown; at: number }>();
const inflight = new Map<string, Promise<unknown>>();

const FRESH_MS = 15_000; // within this window, don't even refetch

export function useCachedApi<T>(url: string | null) {
  const cached = url ? (cache.get(url) as { data: T; at: number } | undefined) : undefined;
  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached && !!url);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refresh = useCallback(async (force = false) => {
    const u = urlRef.current;
    if (!u) return;
    const hit = cache.get(u);
    if (!force && hit && Date.now() - hit.at < FRESH_MS) {
      setData(hit.data as T);
      setLoading(false);
      return;
    }
    let p = inflight.get(u) as Promise<T> | undefined;
    if (!p) {
      p = api<T>(u).then((d) => {
        cache.set(u, { data: d, at: Date.now() });
        inflight.delete(u);
        return d;
      });
      inflight.set(u, p as Promise<unknown>);
    }
    try {
      const d = await p;
      if (urlRef.current === u) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      inflight.delete(u);
      if (urlRef.current === u) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (urlRef.current === u) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    const hit = cache.get(url);
    if (hit) {
      // instant paint from cache, then background refresh
      setData(hit.data as T);
      setLoading(false);
      if (Date.now() - hit.at >= FRESH_MS) void refresh(true);
    } else {
      setLoading(true);
      void refresh(true);
    }
  }, [url, refresh]);

  return { data, loading, error, refresh };
}

/** Invalidate cached endpoints (e.g. after game submit changes stats). */
export function invalidateCache(prefix: string): void {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
