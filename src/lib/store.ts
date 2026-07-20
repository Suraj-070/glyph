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
  prevView: AppView; // track where user came from for back button
  player: PlayerSummary | null;
  duelRoomId: string | null;
  statsNonce: number;
  gamingMode: boolean;
  setView: (v: AppView) => void;
  goBack: () => void;
  setPlayer: (p: PlayerSummary | null) => void;
  startDuel: (roomId: string) => void;
  bumpStats: () => void;
}

export const useGlyph = create<GlyphState>((set, get) => ({
  view: "dashboard",
  prevView: "dashboard",
  player: null,
  duelRoomId: null,
  statsNonce: 0,
  gamingMode: false,
  setView: (v) => set((s) => ({
    prevView: s.view,
    view: v,
    gamingMode: GAME_VIEWS.includes(v),
  })),
  goBack: () => set((s) => ({
    prevView: s.view,
    view: s.prevView,
    gamingMode: GAME_VIEWS.includes(s.prevView),
  })),
  setPlayer: (p) => set({ player: p }),
  startDuel: (roomId) => set((s) => ({
    duelRoomId: roomId,
    prevView: s.view,
    view: "duel",
    gamingMode: true,
  })),
  bumpStats: () => set((s) => ({ statsNonce: s.statsNonce + 1 })),
}));
