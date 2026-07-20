// POST /api/friends/respond — accept or reject a friend request
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await getCurrentPlayer();
  let body: { friendshipId?: string; action?: "accept" | "reject" } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { friendshipId, action } = body;
  if (!friendshipId || !action || !["accept", "reject"].includes(action))
    return NextResponse.json({ error: "friendshipId and action required" }, { status: 400 });

  const friendship = await db.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (friendship.receiverId !== me.id)
    return NextResponse.json({ error: "Not your request" }, { status: 403 });
  if (friendship.status !== "pending")
    return NextResponse.json({ error: "Already handled" }, { status: 409 });

  if (action === "accept") {
    await db.friendship.update({ where: { id: friendshipId }, data: { status: "accepted" } });
    return NextResponse.json({ ok: true, status: "accepted" });
  } else {
    await db.friendship.delete({ where: { id: friendshipId } });
    return NextResponse.json({ ok: true, status: "rejected" });
  }
}
