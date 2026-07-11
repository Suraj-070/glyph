"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Zap, Search, Bell, Menu, X } from "lucide-react";
import { useGlyph, type AppView } from "@/lib/store";
import { Avatar } from "@/components/common/avatar";
import { RankBadge } from "@/components/common/rank-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface TopbarProps {
  player: {
    username: string;
    avatarSeed: string;
    level: number;
    rankPoints: number;
    rank: string;
    xp: number;
    xpIntoLevel: number;
    xpForLevel: number;
  } | null;
  currentStreak?: number;
}

const TITLES: Record<AppView, { title: string; sub: string }> = {
  dashboard: { title: "Dashboard", sub: "Your command center" },
  classic: { title: "Daily Challenge", sub: "One word. Everyone. Every day." },
  practice: { title: "Practice Arena", sub: "Unlimited words. Train your edge." },
  duel: { title: "Real-time Duel", sub: "1v1 live. Same word. No mercy." },
  party: { title: "Party Mode", sub: "2–20 players. Last solver standing." },
  profile: { title: "Profile", sub: "Your GLYPH identity" },
  leaderboard: { title: "Leaderboard", sub: "Global rankings & friends" },
  howto: { title: "How to Play", sub: "Master the grid" },
};

export function Topbar({ player, currentStreak }: TopbarProps) {
  const view = useGlyph((s) => s.view);
  const setView = useGlyph((s) => s.setView);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player?.username ?? "");
  const t = TITLES[view];

  const saveName = async () => {
    if (!name.trim() || name === player?.username) {
      setEditing(false);
      return;
    }
    try {
      await api("/api/profile", { method: "POST", body: JSON.stringify({ username: name.trim() }) });
      window.location.reload();
    } catch {
      setEditing(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 glass border-b border-white/5">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
        {/* mobile brand */}
        <div className="lg:hidden flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal to-violet flex items-center justify-center font-black text-black">
            G
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold leading-tight truncate">{t.title}</h1>
          <p className="text-xs text-muted-foreground truncate hidden sm:block">{t.sub}</p>
        </div>

        {/* streak / xp pills (desktop) */}
        {player ? (
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg glass px-2.5 py-1.5">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-bold tabular-nums">{currentStreak ?? 0}</span>
              <span className="text-[10px] text-muted-foreground">day</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg glass px-2.5 py-1.5">
              <Zap className="h-3.5 w-3.5 text-amber" />
              <span className="text-xs font-bold tabular-nums">{player.xp.toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground">XP</span>
            </div>
          </div>
        ) : null}

        {/* search (decorative) */}
        <div className="hidden xl:flex items-center gap-2 rounded-lg glass px-3 py-1.5 w-44 text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs">Search players…</span>
        </div>

        {/* avatar / profile */}
        {player ? (
          <button
            onClick={() => setView("profile")}
            className="flex items-center gap-2 rounded-xl glass px-2 py-1.5 hover:bg-white/10 transition-colors"
          >
            <Avatar seed={player.avatarSeed} name={player.username} size={32} />
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold leading-tight max-w-[90px] truncate">
                {player.username}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">LVL {player.level}</span>
              </div>
            </div>
          </button>
        ) : null}
      </div>

      {/* XP progress bar */}
      {player ? (
        <div className="h-0.5 bg-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-teal to-violet"
            initial={{ width: 0 }}
            animate={{
              width: `${Math.min(100, (player.xpIntoLevel / player.xpForLevel) * 100)}%`,
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      ) : null}

      {/* Edit name modal */}
      <AnimatePresence>
        {editing ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setEditing(false)}
          >
            <div className="glass-strong rounded-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Edit username</h3>
                <button onClick={() => setEditing(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 rounded-lg px-3 py-2 mb-3 outline-none focus:ring-2 ring-teal"
                maxLength={20}
              />
              <Button onClick={saveName} className="w-full bg-teal text-teal-foreground">
                Save
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
