"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";
import { DashboardView } from "@/components/views/dashboard-view";
import { ClassicView } from "@/components/views/classic-view";
import { PracticeView } from "@/components/views/practice-view";
import { DuelView } from "@/components/views/duel-view";
import { PartyView } from "@/components/views/party-view";
import { ProfileView } from "@/components/views/profile-view";
import { LeaderboardView } from "@/components/views/leaderboard-view";
import { HowToView } from "@/components/views/howto-view";
import { useGlyph } from "@/lib/store";
import { installSubmitFlusher } from "@/lib/game-persist";
import { api } from "@/lib/api";
import { levelForXp, xpProgress, rankForPoints } from "@/lib/types";

interface SessionPlayer {
  id: string;
  username: string;
  avatarSeed: string;
  xp: number;
  level: number;
  rankPoints: number;
  status: string;
}

export default function Page() {
  const view = useGlyph((s) => s.view);
  const setPlayer = useGlyph((s) => s.setPlayer);
  const statsNonce = useGlyph((s) => s.statsNonce);
  const bumpStats = useGlyph((s) => s.bumpStats);
  const [session, setSession] = useState<SessionPlayer | null>(null);
  const [ready, setReady] = useState(false);

  // load session + seed on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api<SessionPlayer>("/api/session");
        if (!alive) return;
        setSession(s);
        setPlayer(s);
        // seed bots + friends — once per browser, not every page load
        if (!localStorage.getItem("glyph-seeded")) {
          api("/api/seed")
            .then(() => localStorage.setItem("glyph-seeded", "1"))
            .catch(() => {});
        }
      } catch {
        // ignore
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [setPlayer]);

  // re-fetch player after stats change (XP/rank updates)
  useEffect(() => {
    if (!ready) return;
    api<SessionPlayer>("/api/session")
      .then((s) => {
        setSession(s);
        setPlayer(s);
      })
      .catch(() => {});
  }, [statsNonce, ready, setPlayer]);

  // flush any offline-queued game submits (on load + when back online)
  useEffect(() => installSubmitFlusher(() => bumpStats()), [bumpStats]);

  // mark presence when leaving
  useEffect(() => {
    const onUnload = () => {
      navigator.sendBeacon?.(
        "/api/friends",
        new Blob([JSON.stringify({ status: "offline" })], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // update presence only when status actually flips (online <-> playing)
  const lastStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !session) return;
    const status = view === "duel" || view === "classic" || view === "practice" || view === "party"
      ? "playing"
      : "online";
    if (lastStatusRef.current === status) return;
    lastStatusRef.current = status;
    api("/api/friends", {
      method: "POST",
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }, [view, ready, session]);

  // no boot gate: shell renders immediately, session hydrates in background
  const playerForViews = session
    ? {
        id: session.id,
        username: session.username,
        avatarSeed: session.avatarSeed,
      }
    : null;

  const playerForTopbar = session
    ? (() => {
        const xp = xpProgress(session.xp);
        return {
          username: session.username,
          avatarSeed: session.avatarSeed,
          level: session.level || levelForXp(session.xp),
          rankPoints: session.rankPoints,
          xp: session.xp,
          xpIntoLevel: xp.intoLevel,
          xpForLevel: xp.needed,
          rank: rankForPoints(session.rankPoints).tier,
        };
      })()
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1">
        <Sidebar player={playerForTopbar} />
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <Topbar player={playerForTopbar} />
          <main className="flex-1 pb-24 lg:pb-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {view === "dashboard" ? (
                  <DashboardView player={playerForTopbar} statsNonce={statsNonce} />
                ) : view === "classic" ? (
                  <ClassicView />
                ) : view === "practice" ? (
                  <PracticeView />
                ) : view === "duel" ? (
                  <DuelView player={playerForViews} />
                ) : view === "party" ? (
                  <PartyView />
                ) : view === "profile" ? (
                  <ProfileView player={playerForViews} statsNonce={statsNonce} />
                ) : view === "leaderboard" ? (
                  <LeaderboardView statsNonce={statsNonce} />
                ) : (
                  <HowToView />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
          <Footer />
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
