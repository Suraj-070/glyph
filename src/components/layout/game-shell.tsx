"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Maximize2, Minimize2, Zap, Flame,
  Swords, Target, Dumbbell, Users, Trophy,
} from "lucide-react";
import { useGlyph, type AppView } from "@/lib/store";
import { Avatar } from "@/components/common/avatar";
import { classNames } from "@/lib/api";

interface GameShellProps {
  children: React.ReactNode;
  player: {
    username: string;
    avatarSeed: string;
    xp: number;
    level: number;
    rank: string;
  } | null;
}

const VIEW_META: Record<AppView, { label: string; icon: React.ElementType; color: string }> = {
  classic:     { label: "Daily Challenge",  icon: Target,   color: "text-teal"    },
  practice:    { label: "Practice Arena",   icon: Dumbbell, color: "text-violet"  },
  duel:        { label: "Real-time Duel",   icon: Swords,   color: "text-rose-400" },
  party:       { label: "Party Mode",       icon: Users,    color: "text-amber"   },
  dashboard:   { label: "Dashboard",        icon: Trophy,   color: "text-teal"    },
  profile:     { label: "Profile",          icon: Trophy,   color: "text-teal"    },
  leaderboard: { label: "Leaderboard",      icon: Trophy,   color: "text-amber"   },
  howto:       { label: "How to Play",      icon: Trophy,   color: "text-violet"  },
};

export function GameShell({ children, player }: GameShellProps) {
  const view = useGlyph((s) => s.view);
  const goBack = useGlyph((s) => s.goBack);
  const prevView = useGlyph((s) => s.prevView);
  const [nativeFS, setNativeFS] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [idle, setIdle] = useState(false);

  const meta = VIEW_META[view] ?? VIEW_META.classic;
  const prevMeta = VIEW_META[prevView] ?? VIEW_META.dashboard;
  const Icon = meta.icon;

  // Auto-hide HUD after 4s of no movement (only in native fullscreen)
  useEffect(() => {
    if (!nativeFS) { setHudVisible(true); setIdle(false); return; }
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setHudVisible(true); setIdle(false); clearTimeout(timer);
      timer = setTimeout(() => { setIdle(true); setHudVisible(false); }, 4000);
    };
    reset();
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("touchstart", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("touchstart", reset);
    };
  }, [nativeFS]);

  // Track native fullscreen state
  useEffect(() => {
    const handler = () => setNativeFS(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleNativeFS = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  };

  const handleBack = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    goBack();
  };

  return (
    <div className="relative flex flex-col w-full h-screen bg-background overflow-hidden">
      {/* Ambient background glow */}
      <div
        className={classNames(
          "pointer-events-none absolute inset-0 opacity-[0.06]",
          view === "duel"    ? "bg-[radial-gradient(ellipse_at_top,#fb7185_0%,transparent_65%)]" :
          view === "classic" ? "bg-[radial-gradient(ellipse_at_top,#2dd4bf_0%,transparent_65%)]" :
          view === "party"   ? "bg-[radial-gradient(ellipse_at_top,#fbbf24_0%,transparent_65%)]" :
                               "bg-[radial-gradient(ellipse_at_top,#a78bfa_0%,transparent_65%)]"
        )}
      />

      {/* ── Gaming HUD ── */}
      <AnimatePresence>
        {hudVisible && (
          <motion.div
            initial={{ opacity: 0, y: -48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -48 }}
            transition={{ duration: 0.2 }}
            className="relative z-30 flex items-center gap-2 px-3 sm:px-5 py-2 border-b border-white/5 bg-black/30 backdrop-blur-md"
          >
            {/* BACK button — goes to previous view */}
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-white/5 group"
              title={`Back to ${prevMeta.label}`}
            >
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div className="w-px h-5 bg-white/10" />

            {/* mode badge */}
            <div className={classNames("flex items-center gap-1.5 text-xs font-bold", meta.color)}>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{meta.label}</span>
            </div>

            {/* GLYPH wordmark — center */}
            <div className="flex-1 flex justify-center">
              <div className="flex items-center gap-1.5">
                <div className="h-5 w-5 rounded-md overflow-hidden">
                  <img src="/logo.svg" alt="GLYPH" className="h-full w-full" />
                </div>
                <span className="font-black text-sm tracking-tight hidden sm:inline">GLYPH</span>
              </div>
            </div>

            {/* player mini-chip */}
            {player ? (
              <div className="flex items-center gap-2 glass rounded-lg px-2 py-1">
                <Avatar seed={player.avatarSeed} name={player.username} size={22} />
                <div className="hidden sm:block text-left">
                  <div className="text-[11px] font-semibold leading-none truncate max-w-[80px]">{player.username}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Zap className="h-2.5 w-2.5 text-amber" />
                    <span className="text-[10px] text-muted-foreground tabular-nums">{player.xp.toLocaleString()}</span>
                    <Flame className="h-2.5 w-2.5 text-orange-400 ml-1" />
                    <span className="text-[10px] text-muted-foreground">LVL {player.level}</span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="w-px h-5 bg-white/10" />

            {/* fullscreen toggle */}
            <button
              onClick={toggleNativeFS}
              title={nativeFS ? "Exit fullscreen" : "Enter fullscreen"}
              className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {nativeFS ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tap-to-reveal hint in native FS idle */}
      <AnimatePresence>
        {nativeFS && idle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
          >
            <span className="text-[10px] text-white/20 tracking-widest uppercase">
              Move mouse to show HUD
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game content */}
      <div className="flex-1 overflow-y-auto scroll-glyph relative z-10">
        {children}
      </div>
    </div>
  );
}
