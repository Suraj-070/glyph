// GET /api/friends/pending — incoming friend requests
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentPlayer();
  const pending = await db.friendship.findMany({
    where: { receiverId: me.id, status: "pending" },
    include: {
      sender: { select: { id: true, username: true, avatarSeed: true, rankPoints: true, xp: true, level: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    requests: pending.map((f) => ({
      id: f.id,
      from: { id: f.sender.id, username: f.sender.username, avatarSeed: f.sender.avatarSeed, level: f.sender.level },
      createdAt: f.createdAt,
    })),
  });
}
