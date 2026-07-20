"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, Users, Trophy, Flame, Search,
  UserPlus, Swords, Check, X, Clock, Bell, ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/common/avatar";
import { RankBadge, RankIcon } from "@/components/common/rank-badge";
import { classNames, api } from "@/lib/api";
import { useCachedApi, invalidateCache } from "@/lib/use-cached-api";
import { useGlyph } from "@/lib/store";

interface LeaderEntry {
  position: number; id: string; username: string; avatarSeed: string;
  xp: number; level: number; rankPoints: number; rankTier: string;
  rankLabel: string; rankColor: string; status: string;
  wins: number; totalGames: number; currentStreak: number;
  longestStreak: number; isMe: boolean;
}

interface FriendEntry {
  id: string; username: string; avatarSeed: string; status: string;
  rankTier: string; rankLabel: string; rankColor: string; level: number;
}

interface PendingRequest {
  id: string;
  from: { id: string; username: string; avatarSeed: string; level: number };
  createdAt: string;
}

interface LeaderViewProps { statsNonce: number; }

export function LeaderboardView({ statsNonce }: LeaderViewProps) {
  const setView = useGlyph((s) => s.setView);
  const startDuel = useGlyph((s) => s.startDuel);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"global" | "friends">("global");
  const [addUsername, setAddUsername] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addMsg, setAddMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [showPending, setShowPending] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  // invite-to-duel state: roomCode being created
  const [inviting, setInviting] = useState<string | null>(null); // friendId being invited

  const { data, refresh } = useCachedApi<{
    leaderboard: LeaderEntry[]; friends: FriendEntry[]; myPosition: number;
  }>("/api/leaderboard");

  useEffect(() => {
    if (statsNonce > 0) { invalidateCache("/api/leaderboard"); void refresh(true); }
  }, [statsNonce, refresh]);

  // Load pending requests
  useEffect(() => {
    api<{ requests: PendingRequest[] }>("/api/friends/pending")
      .then((r) => setPendingRequests(r.requests))
      .catch(() => {});
  }, [statsNonce]);

  const entries = data?.leaderboard ?? [];
  const friends = data?.friends ?? [];
  const myPos = data?.myPosition ?? 0;
  const filtered = entries.filter((e) => e.username.toLowerCase().includes(query.toLowerCase()));
  const podium = entries.slice(0, 3);
  const rest = filtered.slice(3);

  const sendRequest = async () => {
    if (!addUsername.trim()) return;
    setAddLoading(true); setAddMsg(null);
    try {
      const r = await api<{ status: string; message: string }>("/api/friends/request", {
        method: "POST", body: JSON.stringify({ username: addUsername.trim() }),
      });
      setAddMsg({ text: r.message, ok: true });
      setAddUsername("");
      if (r.status === "accepted") { invalidateCache("/api/leaderboard"); refresh(true); }
    } catch (e) {
      setAddMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
    } finally { setAddLoading(false); }
  };

  const respond = async (id: string, action: "accept" | "reject") => {
    setRespondingId(id);
    try {
      await api("/api/friends/respond", { method: "POST", body: JSON.stringify({ friendshipId: id, action }) });
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
      if (action === "accept") { invalidateCache("/api/leaderboard"); refresh(true); }
    } catch { /* ignore */ } finally { setRespondingId(null); }
  };

  // Create room then invite friend via socket
  const inviteToDuel = async (friend: FriendEntry) => {
    setInviting(friend.id);
    try {
      // First go to duel view — this will trigger createRoom
      setView("duel");
      // Store friend to invite once room is created (handled in duel-view via store)
      // For now we navigate to duel — the invite button in friends list is the main UX
    } catch { /* ignore */ } finally { setInviting(null); }
  };

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
        <div className="flex items-center gap-2">
          {/* pending requests bell */}
          {pendingRequests.length > 0 && (
            <button
              onClick={() => setShowPending((v) => !v)}
              className="relative p-2 rounded-xl glass hover:bg-white/10 transition-colors"
              title="Friend requests"
            >
              <Bell className="h-4 w-4 text-amber" />
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center">
                {pendingRequests.length}
              </span>
            </button>
          )}
          {/* tabs */}
          <div className="flex items-center gap-1 rounded-lg glass p-1">
            {(["global", "friends"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={classNames("px-3 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize",
                  tab === t ? "bg-teal/20 text-teal" : "text-muted-foreground hover:text-foreground"
                )}
              >{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Pending requests panel ── */}
      <AnimatePresence>
        {showPending && pendingRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-strong rounded-2xl p-4 border border-amber/20"
          >
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-amber">
              <Bell className="h-4 w-4" /> Friend Requests ({pendingRequests.length})
            </h3>
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <div key={req.id} className="flex items-center gap-3 rounded-xl glass px-3 py-2.5">
                  <Avatar seed={req.from.avatarSeed} name={req.from.username} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{req.from.username}</div>
                    <div className="text-[11px] text-muted-foreground">LVL {req.from.level}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={respondingId === req.id}
                      className="bg-teal text-teal-foreground hover:bg-teal/90 h-8 px-3"
                      onClick={() => respond(req.id, "accept")}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Accept
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      disabled={respondingId === req.id}
                      className="h-8 px-3"
                      onClick={() => respond(req.id, "reject")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {tab === "global" ? (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players…" className="pl-9" />
          </div>

          {podium.length === 3 && !query ? (
            <div className="grid grid-cols-3 gap-3 items-end">
              <PodiumCard entry={podium[1]} place={2} height="h-32" />
              <PodiumCard entry={podium[0]} place={1} height="h-40" />
              <PodiumCard entry={podium[2]} place={3} height="h-28" />
            </div>
          ) : null}

          <div className="glass rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[40px_1fr_80px_70px_60px_80px] gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-white/5">
              <div>#</div><div>Player</div>
              <div className="text-right">RP</div>
              <div className="text-right hidden sm:block">Win%</div>
              <div className="text-right">Streak</div>
              <div></div>
            </div>
            <div className="max-h-[28rem] overflow-y-auto scroll-glyph">
              {(rest.length > 0 ? rest : filtered).map((e, i) => {
                const realPos = entries.findIndex((x) => x.id === e.id) + 1;
                const isFriend = friends.some((f) => f.id === e.id);
                return (
                  <motion.div key={e.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.4) }}
                    className={classNames(
                      "grid grid-cols-[40px_1fr_80px_70px_60px_80px] gap-2 px-4 py-2.5 items-center border-b border-white/5 last:border-0 transition-colors",
                      e.isMe ? "bg-teal/5" : "hover:bg-white/5"
                    )}
                  >
                    <div className="font-mono text-sm font-bold text-muted-foreground">{realPos}</div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar seed={e.avatarSeed} name={e.username} size={32} status={e.status} />
                      <div className="min-w-0">
                        <div className={classNames("text-sm font-semibold truncate flex items-center gap-1", e.isMe && "text-teal")}>
                          {e.username} {e.isMe ? "(you)" : ""}
                          {isFriend && <span className="text-[9px] text-teal/60 font-normal">friend</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RankIcon tier={e.rankTier} size={11} />
                          <span className="text-[10px] text-muted-foreground">LVL {e.level} · {e.rankLabel}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-sm">{e.rankPoints}</div>
                    <div className="text-right text-xs hidden sm:block">
                      {e.totalGames > 0 ? Math.round((e.wins / e.totalGames) * 100) : 0}%
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-0.5 text-orange-400 text-xs font-bold">
                        <Flame className="h-3 w-3" />{e.currentStreak}
                      </span>
                    </div>
                    {/* add friend / challenge button */}
                    <div className="text-right">
                      {!e.isMe && !isFriend && (
                        <AddFriendButton username={e.username} onAdded={() => { invalidateCache("/api/leaderboard"); refresh(true); }} />
                      )}
                      {!e.isMe && isFriend && e.status === "online" && (
                        <button
                          onClick={() => setView("duel")}
                          className="text-[10px] text-rose-300 hover:text-rose-200 flex items-center gap-0.5 ml-auto"
                          title="Challenge to duel"
                        >
                          <Swords className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* ── Friends tab ── */
        <div className="space-y-4">
          {/* Add friend */}
          <div className="glass-strong rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-teal" /> Add Friend
            </h3>
            <div className="flex gap-2">
              <Input
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendRequest()}
                placeholder="Enter username…"
                className="flex-1"
                maxLength={20}
              />
              <Button
                onClick={sendRequest}
                disabled={addLoading || !addUsername.trim()}
                className="bg-teal text-teal-foreground hover:bg-teal/90 shrink-0"
              >
                {addLoading ? "…" : "Send"}
              </Button>
            </div>
            <AnimatePresence>
              {addMsg && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={classNames("text-xs mt-2", addMsg.ok ? "text-teal" : "text-rose-300")}
                >
                  {addMsg.ok ? "✓" : "✕"} {addMsg.text}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Friends list */}
          <div className="glass rounded-2xl p-4">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-teal" /> Friends ({friends.length})
            </h3>
            {friends.length > 0 ? (
              <div className="space-y-1.5">
                {friends.map((f) => (
                  <motion.div key={f.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5 transition-colors"
                  >
                    <Avatar seed={f.avatarSeed} name={f.username} size={40} status={f.status} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{f.username}</div>
                      <div className="text-[11px] capitalize flex items-center gap-1.5">
                        <span className={classNames(
                          "h-1.5 w-1.5 rounded-full inline-block",
                          f.status === "online" ? "bg-teal" :
                          f.status === "playing" ? "bg-amber animate-pulse" : "bg-white/20"
                        )} />
                        <span className="text-muted-foreground">
                          {f.status === "playing" ? "In a match" : f.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right hidden sm:block">
                        <RankBadge tier={f.rankTier} size="sm" />
                        <div className="text-[10px] text-muted-foreground mt-0.5">LVL {f.level}</div>
                      </div>
                      {/* Challenge button — only if online/idle */}
                      {(f.status === "online" || f.status === "idle") && (
                        <ChallengeButton friend={f} />
                      )}
                      {f.status === "playing" && (
                        <span className="text-[10px] text-amber px-2 py-1 rounded-lg bg-amber/10 font-semibold">
                          In match
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 space-y-2">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No friends yet.</p>
                <p className="text-xs text-muted-foreground">Add friends by username above or from the global leaderboard.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline add friend button for leaderboard rows ──
function AddFriendButton({ username, onAdded }: { username: string; onAdded: () => void }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"sent" | "friends" | null>(null);

  const send = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const r = await api<{ status: string }>("/api/friends/request", {
        method: "POST", body: JSON.stringify({ username }),
      });
      setDone(r.status === "accepted" ? "friends" : "sent");
      if (r.status === "accepted") onAdded();
    } catch { /* show nothing */ } finally { setLoading(false); }
  };

  if (done === "friends") return <span className="text-[10px] text-teal">Friends!</span>;
  if (done === "sent") return <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" /> Sent</span>;

  return (
    <button onClick={send} disabled={loading}
      className="text-[10px] text-violet hover:text-violet/80 flex items-center gap-0.5 ml-auto disabled:opacity-50"
      title={`Add ${username} as friend`}
    >
      <UserPlus className="h-3 w-3" />
    </button>
  );
}

// ── Challenge button — creates room and gives a copy-able link ──
function ChallengeButton({ friend }: { friend: FriendEntry }) {
  const setView = useGlyph((s) => s.setView);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 hover:text-rose-200 px-2 py-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
      >
        <Swords className="h-3.5 w-3.5" /> Challenge
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 6 }}
            className="absolute right-0 top-full mt-1 w-52 glass-strong rounded-xl p-3 z-50 border border-white/10 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
              Go to Duel, create a room, then copy the code and share it — or your friend can join from their Friends list if they open Duel at the same time.
            </p>
            <Button
              size="sm"
              className="w-full bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 border border-rose-500/30"
              onClick={() => { setOpen(false); setView("duel"); }}
            >
              <Swords className="h-3.5 w-3.5 mr-1.5" /> Open Duel Arena
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PodiumCard({ entry, place, height }: { entry: LeaderEntry; place: number; height: string }) {
  const colors = ["#fbbf24", "#cbd5e1", "#cd7f32"];
  const color = colors[place - 1];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: place * 0.1, type: "spring", damping: 16 }}
      className={classNames("glass-strong rounded-t-xl rounded-b-lg flex flex-col items-center justify-end pt-3 pb-3 px-2 relative overflow-hidden", height, place === 1 && "glow-teal")}
    >
      <div className="absolute top-0 inset-x-0 h-1" style={{ backgroundColor: color }} />
      {place === 1 ? <Crown className="h-5 w-5 text-amber mb-1" /> : null}
      <Avatar seed={entry.avatarSeed} name={entry.username} size={place === 1 ? 48 : 36} />
      <div className="text-xs font-bold mt-1.5 truncate max-w-full">{entry.username}</div>
      <div className="text-[10px] text-muted-foreground">LVL {entry.level}</div>
      <div className="text-sm font-black mt-0.5" style={{ color }}>{entry.rankPoints}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{entry.rankLabel}</div>
      <div className="absolute -bottom-6 text-5xl font-black opacity-10" style={{ color }}>{place}</div>
    </motion.div>
  );
}
