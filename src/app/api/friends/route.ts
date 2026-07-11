// POST /api/friends/presence — update the current player's presence status (broadcast via socket)
// GET  /api/friends — list friends with presence
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";
import { rankForPoints, levelForXp } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentPlayer();
  const friends = await db.friendship.findMany({
    where: {
      OR: [{ senderId: me.id, status: "accepted" }, { receiverId: me.id, status: "accepted" }],
    },
    include: {
      sender: { select: { id: true, username: true, avatarSeed: true, status: true, rankPoints: true, level: true, xp: true } },
      receiver: { select: { id: true, username: true, avatarSeed: true, status: true, rankPoints: true, level: true, xp: true } },
    },
  });
  const list = friends.map((f) => {
    const other = f.senderId === me.id ? f.receiver : f.sender;
    const rank = rankForPoints(other.rankPoints);
    return {
      id: other.id,
      username: other.username,
      avatarSeed: other.avatarSeed,
      status: other.status,
      rankTier: rank.tier,
      rankLabel: rank.label,
      rankColor: rank.color,
      level: other.level || levelForXp(other.xp),
    };
  });
  // online first
  list.sort((a, b) => {
    const order = { online: 0, playing: 1, idle: 2, offline: 3 } as Record<string, number>;
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });
  return NextResponse.json({ friends: list });
}

export async function POST(req: Request) {
  const me = await getCurrentPlayer();
  let body: { status?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = body.status;
  if (!["online", "idle", "playing", "offline"].includes(status || "")) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  await db.player.update({ where: { id: me.id }, data: { status: status as string } });
  return NextResponse.json({ ok: true, status });
}
