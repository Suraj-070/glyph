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

// Views that get the fullscreen gaming shell
export const GAME_VIEWS: AppView[] = ["classic", "practice", "duel", "party"];

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
  duelRoomId: string | null;
  statsNonce: number;
  // fullscreen gaming mode — true while in a GAME_VIEW
  gamingMode: boolean;
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
  gamingMode: false,
  setView: (v) => set({ view: v, gamingMode: GAME_VIEWS.includes(v) }),
  setPlayer: (p) => set({ player: p }),
  startDuel: (roomId) => set({ duelRoomId: roomId, view: "duel", gamingMode: true }),
  bumpStats: () => set((s) => ({ statsNonce: s.statsNonce + 1 })),
}));
