"use client";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Target,
  Swords,
  Users,
  Dumbbell,
  Trophy,
  User,
  HelpCircle,
  Flame,
} from "lucide-react";
import { useGlyph, type AppView } from "@/lib/store";
import { Avatar } from "@/components/common/avatar";
import { RankBadge } from "@/components/common/rank-badge";
import { classNames } from "@/lib/api";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  view: AppView;
  label: string;
  icon: LucideIcon;
  group: "play" | "social";
  badge?: string;
}

const NAV: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "play" },
  { view: "classic", label: "Daily Challenge", icon: Target, group: "play" },
  { view: "duel", label: "Real-time Duel", icon: Swords, group: "play", badge: "LIVE" },
  { view: "party", label: "Party Mode", icon: Users, group: "play" },
  { view: "practice", label: "Practice", icon: Dumbbell, group: "play" },
  { view: "leaderboard", label: "Leaderboard", icon: Trophy, group: "social" },
  { view: "profile", label: "Profile", icon: User, group: "social" },
  { view: "howto", label: "How to Play", icon: HelpCircle, group: "social" },
];

interface SidebarProps {
  player: {
    username: string;
    avatarSeed: string;
    level: number;
    rankPoints: number;
    rank: string;
  } | null;
  currentStreak?: number;
}

export function Sidebar({ player, currentStreak }: SidebarProps) {
  const view = useGlyph((s) => s.view);
  const setView = useGlyph((s) => s.setView);

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 glass border-r border-white/5">
      {/* brand */}
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-teal to-violet flex items-center justify-center font-black text-black text-lg shadow-lg">
          G
          <span className="absolute inset-0 rounded-xl ring-1 ring-white/20" />
        </div>
        <div>
          <div className="font-black tracking-tight text-lg leading-none">GLYPH</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Decode the Grid
          </div>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto scroll-glyph px-3 py-2 space-y-5">
        <div>
          <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Play
          </div>
          <div className="space-y-0.5">
            {NAV.filter((n) => n.group === "play").map((item) => (
              <NavButton key={item.view} item={item} active={view === item.view} onClick={() => setView(item.view)} />
            ))}
          </div>
        </div>
        <div>
          <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Social
          </div>
          <div className="space-y-0.5">
            {NAV.filter((n) => n.group === "social").map((item) => (
              <NavButton key={item.view} item={item} active={view === item.view} onClick={() => setView(item.view)} />
            ))}
          </div>
        </div>
      </nav>

      {/* player card */}
      {player ? (
        <div className="p-3 border-t border-white/5">
          <div className="glass-strong rounded-xl p-3 flex items-center gap-3">
            <Avatar seed={player.avatarSeed} name={player.username} size={40} status="online" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{player.username}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-muted-foreground">LVL {player.level}</span>
                <RankBadge tier={player.rank} size="sm" showLabel={false} />
              </div>
            </div>
            {typeof currentStreak === "number" && currentStreak > 0 ? (
              <div className="flex items-center gap-0.5 text-orange-400" title={`${currentStreak}-day streak`}>
                <Flame className="h-4 w-4" />
                <span className="text-xs font-bold">{currentStreak}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={classNames(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all relative group",
        active
          ? "bg-teal/15 text-teal"
          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
      )}
    >
      {active ? (
        <motion.span
          layoutId="nav-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-teal"
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
        />
      ) : null}
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{item.label}</span>
      {item.badge ? (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase tracking-wide">
          {item.badge}
        </span>
      ) : null}
    </button>
  );
}

// Mobile bottom nav
export function MobileNav() {
  const view = useGlyph((s) => s.view);
  const setView = useGlyph((s) => s.setView);
  const items = NAV.filter((n) =>
    ["dashboard", "classic", "duel", "leaderboard", "profile"].includes(n.view)
  );
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={classNames(
                "flex flex-col items-center gap-0.5 py-2 px-3 flex-1 text-[10px] font-medium transition-colors",
                active ? "text-teal" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label.split(" ")[0]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
