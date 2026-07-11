// GET /api/leaderboard — global leaderboard (top by rankPoints) + friends online
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";
import { rankForPoints, levelForXp } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentPlayer();

  // Ensure I'm marked online
  await db.player.update({
    where: { id: me.id },
    data: { status: "online" },
  }).catch(() => {});

  const top = await db.player.findMany({
    orderBy: { rankPoints: "desc" },
    take: 50,
    select: {
      id: true,
      username: true,
      avatarSeed: true,
      xp: true,
      level: true,
      rankPoints: true,
      status: true,
      profile: { select: { wins: true, totalGames: true, currentStreak: true, longestStreak: true } },
    },
  });

  const ranked = top.map((p, i) => {
    const rank = rankForPoints(p.rankPoints);
    return {
      position: i + 1,
      id: p.id,
      username: p.username,
      avatarSeed: p.avatarSeed,
      xp: p.xp,
      level: p.level || levelForXp(p.xp),
      rankPoints: p.rankPoints,
      rankTier: rank.tier,
      rankLabel: rank.label,
      rankColor: rank.color,
      status: p.status,
      wins: p.profile?.wins ?? 0,
      totalGames: p.profile?.totalGames ?? 0,
      currentStreak: p.profile?.currentStreak ?? 0,
      longestStreak: p.profile?.longestStreak ?? 0,
      isMe: p.id === me.id,
    };
  });

  // Friends (accepted) with presence
  const friends = await db.friendship.findMany({
    where: {
      OR: [{ senderId: me.id, status: "accepted" }, { receiverId: me.id, status: "accepted" }],
    },
    include: {
      sender: { select: { id: true, username: true, avatarSeed: true, status: true, rankPoints: true, xp: true, level: true } },
      receiver: { select: { id: true, username: true, avatarSeed: true, status: true, rankPoints: true, xp: true, level: true } },
    },
  });
  const friendList = friends.map((f) => {
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

  return NextResponse.json({
    leaderboard: ranked,
    friends: friendList,
    myPosition: ranked.findIndex((r) => r.isMe) + 1,
  });
}
