"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Zap, Search, LogIn, LogOut, UserPlus, X, ShieldCheck } from "lucide-react";
import { useGlyph, type AppView } from "@/lib/store";
import { Avatar } from "@/components/common/avatar";
import { RankBadge } from "@/components/common/rank-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface TopbarProps {
  player: {
    username: string;
    avatarSeed: string;
    email?: string | null;
    level: number;
    rankPoints: number;
    rank: string;
    xp: number;
    xpIntoLevel: number;
    xpForLevel: number;
    authProvider?: string;
  } | null;
  currentStreak?: number;
  onLogin?: () => void;
  onRegister?: () => void;
  onLogout?: () => void;
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

export function Topbar({ player, currentStreak, onLogin, onRegister, onLogout }: TopbarProps) {
  const view = useGlyph((s) => s.view);
  const setView = useGlyph((s) => s.setView);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player?.username ?? "");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const t = TITLES[view];

  const isGuest = !player?.authProvider || player.authProvider === "guest";

  const saveName = async () => {
    if (!name.trim() || name === player?.username) { setEditing(false); return; }
    try {
      await api("/api/profile", { method: "POST", body: JSON.stringify({ username: name.trim() }) });
      window.location.reload();
    } catch { setEditing(false); }
  };

  return (
    <header className="sticky top-0 z-30 glass border-b border-white/5">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
        {/* mobile brand */}
        <div className="lg:hidden flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal to-violet flex items-center justify-center font-black text-black">G</div>
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

        {/* auth area */}
        {player ? (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl glass px-2 py-1.5 hover:bg-white/10 transition-colors"
            >
              <Avatar seed={player.avatarSeed} name={player.username} size={32} />
              <div className="hidden sm:block text-left">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold leading-tight max-w-[80px] truncate">{player.username}</span>
                  {!isGuest && <ShieldCheck className="h-3 w-3 text-teal shrink-0" title="Registered account" />}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {isGuest ? "Guest" : `LVL ${player.level}`}
                </div>
              </div>
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-52 glass-strong rounded-xl border border-white/10 shadow-xl z-50 overflow-hidden"
                  onClick={() => setUserMenuOpen(false)}
                >
                  {/* user info */}
                  <div className="px-4 py-3 border-b border-white/5">
                    <div className="font-semibold text-sm truncate">{player.username}</div>
                    {player.email && (
                      <div className="text-[11px] text-muted-foreground truncate">{player.email}</div>
                    )}
                    {isGuest && (
                      <div className="text-[11px] text-amber mt-0.5">Guest — progress may be lost</div>
                    )}
                  </div>

                  <div className="p-1.5 space-y-0.5">
                    <button
                      onClick={() => { setView("profile"); setUserMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-white/5 transition-colors"
                    >
                      View Profile
                    </button>
                    <button
                      onClick={() => { setEditing(true); setUserMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-white/5 transition-colors"
                    >
                      Edit Username
                    </button>
                  </div>

                  {isGuest ? (
                    <div className="p-1.5 border-t border-white/5 space-y-0.5">
                      <button
                        onClick={() => { onLogin?.(); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-teal rounded-lg hover:bg-teal/10 transition-colors font-medium"
                      >
                        <LogIn className="h-3.5 w-3.5" /> Sign In
                      </button>
                      <button
                        onClick={() => { onRegister?.(); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-violet rounded-lg hover:bg-violet/10 transition-colors font-medium"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Create Account
                      </button>
                    </div>
                  ) : (
                    <div className="p-1.5 border-t border-white/5">
                      <button
                        onClick={() => { onLogout?.(); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-300 rounded-lg hover:bg-rose-500/10 transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Sign Out
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* pre-session skeleton */
          <div className="h-9 w-24 rounded-xl glass animate-pulse" />
        )}
      </div>

      {/* XP progress bar */}
      {player ? (
        <div className="h-0.5 bg-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-teal to-violet"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, (player.xpIntoLevel / player.xpForLevel) * 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      ) : null}

      {/* Edit username modal */}
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
                <button onClick={() => setEditing(false)}><X className="h-4 w-4" /></button>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 rounded-lg px-3 py-2 mb-3 outline-none focus:ring-2 ring-teal"
                maxLength={20}
              />
              <Button onClick={saveName} className="w-full bg-teal text-teal-foreground">Save</Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
