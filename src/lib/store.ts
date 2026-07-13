// GLYPH — client app state (Zustand)
"use client";
import { create } from "zustand";

export type AppView =
  | "dashboard"
  | "classic"
  | "practice"
  | "duel"
  | "party"
  | "profile"
  | "leaderboard"
  | "howto";

interface PlayerSummary {
  id: string;
  username: string;
  avatarSeed: string;
  xp: number;
  level: number;
  rankPoints: number;
  status: string;
}

interface GlyphState {
  view: AppView;
  player: PlayerSummary | null;
  // duel setup
  duelRoomId: string | null;
  // refresh token for stats after games
  statsNonce: number;
  setView: (v: AppView) => void;
  setPlayer: (p: PlayerSummary | null) => void;
  startDuel: (roomId: string) => void;
  bumpStats: () => void;
}

export const useGlyph = create<GlyphState>((set) => ({
  view: "dashboard",
  player: null,
  duelRoomId: null,
  statsNonce: 0,
  setView: (v) => set({ view: v }),
  setPlayer: (p) => set({ player: p }),
  startDuel: (roomId) => set({ duelRoomId: roomId, view: "duel" }),
  bumpStats: () => set((s) => ({ statsNonce: s.statsNonce + 1 })),
}));
