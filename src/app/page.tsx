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
import { AuthModal } from "@/components/auth/auth-modal";
import type { SessionPlayer } from "@/components/auth/auth-modal";
import { useGlyph } from "@/lib/store";
import { installSubmitFlusher } from "@/lib/game-persist";
import { api } from "@/lib/api";
import { levelForXp, xpProgress, rankForPoints } from "@/lib/types";

export default function Page() {
  const view = useGlyph((s) => s.view);
  const setPlayer = useGlyph((s) => s.setPlayer);
  const statsNonce = useGlyph((s) => s.statsNonce);
  const bumpStats = useGlyph((s) => s.bumpStats);
  const [session, setSession] = useState<SessionPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");

  const loadSession = async () => {
    try {
      const s = await api<SessionPlayer>("/api/session");
      setSession(s);
      setPlayer(s);
      if (!localStorage.getItem("glyph-seeded")) {
        api("/api/seed").then(() => localStorage.setItem("glyph-seeded", "1")).catch(() => {});
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await loadSession();
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    api<SessionPlayer>("/api/session")
      .then((s) => { setSession(s); setPlayer(s); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsNonce, ready]);

  useEffect(() => installSubmitFlusher(() => bumpStats()), [bumpStats]);

  useEffect(() => {
    const onUnload = () =>
      navigator.sendBeacon?.("/api/friends", new Blob([JSON.stringify({ status: "offline" })], { type: "application/json" }));
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const lastStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !session) return;
    const status = ["duel", "classic", "practice", "party"].includes(view) ? "playing" : "online";
    if (lastStatusRef.current === status) return;
    lastStatusRef.current = status;
    api("/api/friends", { method: "POST", body: JSON.stringify({ status }) }).catch(() => {});
  }, [view, ready, session]);

  const handleAuthSuccess = (player: SessionPlayer) => {
    setSession(player);
    setPlayer(player);
  };

  const handleLogout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.reload();
  };

  const playerForViews = session
    ? { id: session.id, username: session.username, avatarSeed: session.avatarSeed }
    : null;

  const playerForTopbar = session
    ? (() => {
        const xp = xpProgress(session.xp);
        return {
          username: session.username,
          avatarSeed: session.avatarSeed,
          email: session.email,
          level: session.level || levelForXp(session.xp),
          rankPoints: session.rankPoints,
          xp: session.xp,
          xpIntoLevel: xp.intoLevel,
          xpForLevel: xp.needed,
          rank: rankForPoints(session.rankPoints).tier,
          authProvider: session.authProvider,
        };
      })()
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1">
        <Sidebar player={playerForTopbar} />
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <Topbar
            player={playerForTopbar}
            onLogin={() => { setAuthTab("login"); setAuthOpen(true); }}
            onRegister={() => { setAuthTab("register"); setAuthOpen(true); }}
            onLogout={handleLogout}
          />
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

      <AuthModal
        open={authOpen}
        defaultTab={authTab}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
