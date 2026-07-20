"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";
import { GameShell } from "@/components/layout/game-shell";
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
import { useGlyph, GAME_VIEWS } from "@/lib/store";
import { Swords } from "lucide-react";
import { installSubmitFlusher } from "@/lib/game-persist";
import { api } from "@/lib/api";
import { Avatar } from "@/components/common/avatar";
import { levelForXp, xpProgress, rankForPoints } from "@/lib/types";

export default function Page() {
  const view = useGlyph((s) => s.view);
  const gamingMode = useGlyph((s) => s.gamingMode);
  const setPlayer = useGlyph((s) => s.setPlayer);
  const statsNonce = useGlyph((s) => s.statsNonce);
  const bumpStats = useGlyph((s) => s.bumpStats);
  const [session, setSession] = useState<SessionPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [duelInvite, setDuelInvite] = useState<{ from: string; avatarSeed: string; roomCode: string } | null>(null);
  const globalSocketRef = useRef<ReturnType<typeof io> | null>(null);

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
    (async () => { await loadSession(); if (alive) setReady(true); })();
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

  // Global duel invite listener — works on ANY page
  useEffect(() => {
    if (!session) return;
    const url = process.env.NEXT_PUBLIC_ARENA_URL || "http://localhost:3003";
    const sock = io(url, { transports: ["websocket", "polling"] });
    globalSocketRef.current = sock;
    sock.on("connect", () => {
      sock.emit("player:identify", { id: session.id, name: session.username, avatarSeed: session.avatarSeed });
    });
    sock.on("duel:invited", (p: { from: string; avatarSeed: string; roomCode: string }) => {
      setDuelInvite(p);
    });
    return () => { sock.disconnect(); globalSocketRef.current = null; };
  }, [session?.id]);

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
    const status = GAME_VIEWS.includes(view) ? "playing" : "online";
    if (lastStatusRef.current === status) return;
    lastStatusRef.current = status;
    api("/api/friends", { method: "POST", body: JSON.stringify({ status }) }).catch(() => {});
  }, [view, ready, session]);

  const handleAuthSuccess = (player: SessionPlayer) => { setSession(player); setPlayer(player); };
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

  // The animated game content block (reused in both shell modes)
  const gameContent = (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="h-full"
      >
        {view === "dashboard"   ? <DashboardView player={playerForTopbar} statsNonce={statsNonce} /> :
         view === "classic"     ? <ClassicView /> :
         view === "practice"    ? <PracticeView /> :
         view === "duel"        ? <DuelView player={playerForViews} /> :
         view === "party"       ? <PartyView /> :
         view === "profile"     ? <ProfileView player={playerForViews} statsNonce={statsNonce} /> :
         view === "leaderboard" ? <LeaderboardView statsNonce={statsNonce} /> :
                                  <HowToView />}
      </motion.div>
    </AnimatePresence>
  );

  // Global duel invite toast — shown on every page
  const globalInviteToast = duelInvite ? (
    <AnimatePresence>
      <motion.div
        key="global-invite"
        initial={{ opacity: 0, y: -64, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -64, scale: 0.95 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-4 px-5 py-4 rounded-2xl shadow-xl border border-violet/30 min-w-[300px] max-w-[400px]"
        style={{ background: "oklch(0.19 0.02 264 / 0.97)", backdropFilter: "blur(16px)" }}
      >
        <Avatar seed={duelInvite.avatarSeed} name={duelInvite.from} size={44} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{duelInvite.from}</p>
          <p className="text-xs text-muted-foreground">challenged you to a duel!</p>
          <p className="text-[11px] text-violet font-mono mt-0.5 tracking-widest">{duelInvite.roomCode}</p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => {
              const code = duelInvite.roomCode;
              setDuelInvite(null);
              sessionStorage.setItem("glyph-pending-invite", code);
              setView("duel");
            }}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 border border-rose-500/30 transition-colors"
          >
            <Swords className="h-3.5 w-3.5" /> Join
          </button>
          <button
            onClick={() => setDuelInvite(null)}
            className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-white/5 transition-colors text-center"
          >
            Decline
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  ) : null;

  // ── GAMING MODE — fullscreen shell, no sidebar/topbar/footer ──
  if (gamingMode) {
    return (
      <>
        <GameShell player={playerForTopbar}>
          {gameContent}
        </GameShell>
        <AuthModal
          open={authOpen}
          defaultTab={authTab}
          onClose={() => setAuthOpen(false)}
          onSuccess={handleAuthSuccess}
        />
        {globalInviteToast}
      </>
    );
  }

  // ── NORMAL MODE — sidebar + topbar + footer ──
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
            {gameContent}
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
      {globalInviteToast}
    </div>
  );
}