// GET /api/profile — public-ish profile (current player's full profile + achievements)
// POST /api/profile — update username
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";
import { rankForPoints, levelForXp } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentPlayer();
  const profile = await db.playerProfile.upsert({
    where: { playerId: me.id },
    update: {},
    create: { playerId: me.id },
  });
  const achievements = await db.achievement.findMany({
    where: { playerId: me.id },
    orderBy: { unlockedAt: "desc" },
  });
  const rank = rankForPoints(me.rankPoints);
  return NextResponse.json({
    id: me.id,
    username: me.username,
    avatarSeed: me.avatarSeed,
    xp: me.xp,
    level: me.level || levelForXp(me.xp),
    rankPoints: me.rankPoints,
    rankTier: rank.tier,
    rankLabel: rank.label,
    rankColor: rank.color,
    createdAt: me.createdAt,
    profile,
    achievements,
  });
}

export async function POST(req: Request) {
  const me = await getCurrentPlayer();
  let body: { username?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const username = (body.username || "").toString().trim();
  if (!username || username.length < 2 || username.length > 20) {
    return NextResponse.json({ error: "Username must be 2-20 chars" }, { status: 400 });
  }
  try {
    const updated = await db.player.update({
      where: { id: me.id },
      data: { username, avatarSeed: username },
    });
    return NextResponse.json({
      id: updated.id,
      username: updated.username,
      avatarSeed: updated.avatarSeed,
    });
  } catch {
    return NextResponse.json({ error: "Username taken" }, { status: 409 });
  }
}
