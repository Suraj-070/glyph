"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Users, Trophy, Flame, Zap, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/common/avatar";
import { RankBadge, RankIcon } from "@/components/common/rank-badge";
import { api, classNames } from "@/lib/api";

interface LeaderEntry {
  position: number;
  id: string;
  username: string;
  avatarSeed: string;
  xp: number;
  level: number;
  rankPoints: number;
  rankTier: string;
  rankLabel: string;
  rankColor: string;
  status: string;
  wins: number;
  totalGames: number;
  currentStreak: number;
  longestStreak: number;
  isMe: boolean;
}

interface FriendEntry {
  id: string;
  username: string;
  avatarSeed: string;
  status: string;
  rankTier: string;
  rankLabel: string;
  rankColor: string;
  level: number;
}

interface LeaderViewProps {
  statsNonce: number;
}

export function LeaderboardView({ statsNonce }: LeaderViewProps) {
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [myPos, setMyPos] = useState(0);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"global" | "friends">("global");

  useEffect(() => {
    api<{ leaderboard: LeaderEntry[]; friends: FriendEntry[]; myPosition: number }>(
      "/api/leaderboard"
    ).then((d) => {
      setEntries(d.leaderboard);
      setFriends(d.friends);
      setMyPos(d.myPosition);
    });
  }, [statsNonce]);

  const filtered = entries.filter((e) =>
    e.username.toLowerCase().includes(query.toLowerCase())
  );

  const podium = entries.slice(0, 3);
  const rest = filtered.slice(3);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-2">
            <Crown className="h-6 w-6 text-amber" /> Global Leaderboard
          </h2>
          <p className="text-sm text-muted-foreground">
            {myPos > 0 ? `You're ranked #${myPos} of ${entries.length}` : "Climb the ranks"}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg glass p-1">
          <button
            onClick={() => setTab("global")}
            className={classNames(
              "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
              tab === "global" ? "bg-teal/20 text-teal" : "text-muted-foreground"
            )}
          >
            Global
          </button>
          <button
            onClick={() => setTab("friends")}
            className={classNames(
              "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
              tab === "friends" ? "bg-teal/20 text-teal" : "text-muted-foreground"
            )}
          >
            Friends
          </button>
        </div>
      </div>

      {tab === "global" ? (
        <>
          {/* search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players…"
              className="pl-9"
            />
          </div>

          {/* podium */}
          {podium.length === 3 && !query ? (
            <div className="grid grid-cols-3 gap-3 items-end">
              <PodiumCard entry={podium[1]} place={2} height="h-32" />
              <PodiumCard entry={podium[0]} place={1} height="h-40" />
              <PodiumCard entry={podium[2]} place={3} height="h-28" />
            </div>
          ) : null}

          {/* list */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[40px_1fr_80px_70px_60px] gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-white/5">
              <div>#</div>
              <div>Player</div>
              <div className="text-right">RP</div>
              <div className="text-right hidden sm:block">Win%</div>
              <div className="text-right">Streak</div>
            </div>
            <div className="max-h-[28rem] overflow-y-auto scroll-glyph">
              {(rest.length > 0 ? rest : filtered).map((e, i) => {
                const realPos = entries.findIndex((x) => x.id === e.id) + 1;
                return (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.4) }}
                    className={classNames(
                      "grid grid-cols-[40px_1fr_80px_70px_60px] gap-2 px-4 py-2.5 items-center border-b border-white/5 last:border-0 transition-colors",
                      e.isMe ? "bg-teal/5" : "hover:bg-white/5"
                    )}
                  >
                    <div className="font-mono text-sm font-bold text-muted-foreground">
                      {realPos}
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar seed={e.avatarSeed} name={e.username} size={32} status={e.status} />
                      <div className="min-w-0">
                        <div className={classNames("text-sm font-semibold truncate", e.isMe && "text-teal")}>
                          {e.username} {e.isMe ? "(you)" : ""}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RankIcon tier={e.rankTier} size={11} />
                          <span className="text-[10px] text-muted-foreground">
                            LVL {e.level} · {e.rankLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-sm">{e.rankPoints}</div>
                    <div className="text-right text-xs hidden sm:block">
                      {e.totalGames > 0 ? Math.round((e.wins / e.totalGames) * 100) : 0}%
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-0.5 text-orange-400 text-xs font-bold">
                        <Flame className="h-3 w-3" />
                        {e.currentStreak}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* friends tab */
        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-teal" /> Friends ({friends.length})
          </h3>
          {friends.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {friends.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-xl p-3 hover:bg-white/5 transition-colors"
                >
                  <Avatar seed={f.avatarSeed} name={f.username} size={40} status={f.status} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{f.username}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {f.status === "playing" ? "In a match" : f.status}
                    </div>
                  </div>
                  <div className="text-right">
                    <RankBadge tier={f.rankTier} size="sm" />
                    <div className="text-[10px] text-muted-foreground mt-0.5">LVL {f.level}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No friends yet. Bot opponents are auto-added as friends.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PodiumCard({
  entry,
  place,
  height,
}: {
  entry: LeaderEntry;
  place: number;
  height: string;
}) {
  const colors = ["#fbbf24", "#cbd5e1", "#cd7f32"];
  const color = colors[place - 1];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: place * 0.1, type: "spring", damping: 16 }}
      className={classNames(
        "glass-strong rounded-t-xl rounded-b-lg flex flex-col items-center justify-end pt-3 pb-3 px-2 relative overflow-hidden",
        height,
        place === 1 && "glow-teal"
      )}
    >
      <div
        className="absolute top-0 inset-x-0 h-1"
        style={{ backgroundColor: color }}
      />
      {place === 1 ? <Crown className="h-5 w-5 text-amber mb-1" /> : null}
      <Avatar seed={entry.avatarSeed} name={entry.username} size={place === 1 ? 48 : 36} />
      <div className="text-xs font-bold mt-1.5 truncate max-w-full">{entry.username}</div>
      <div className="text-[10px] text-muted-foreground">LVL {entry.level}</div>
      <div className="text-sm font-black mt-0.5" style={{ color }}>
        {entry.rankPoints}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{entry.rankLabel}</div>
      <div className="absolute -bottom-6 text-5xl font-black opacity-10" style={{ color }}>
        {place}
      </div>
    </motion.div>
  );
}
