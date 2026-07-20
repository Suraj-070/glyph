// POST /api/friends/request — send a friend request by username
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await getCurrentPlayer();
  let body: { username?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  if (!username) return NextResponse.json({ error: "Username required" }, { status: 400 });
  if (username.toLowerCase() === me.username.toLowerCase())
    return NextResponse.json({ error: "Can't add yourself" }, { status: 400 });

  const target = await db.player.findUnique({ where: { username } });
  if (!target) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  // Check existing
  const existing = await db.friendship.findFirst({
    where: {
      OR: [
        { senderId: me.id, receiverId: target.id },
        { senderId: target.id, receiverId: me.id },
      ],
    },
  });

  if (existing) {
    if (existing.status === "accepted")
      return NextResponse.json({ error: "Already friends" }, { status: 409 });
    if (existing.status === "pending" && existing.senderId === me.id)
      return NextResponse.json({ error: "Request already sent" }, { status: 409 });
    // They already sent us one — auto-accept
    if (existing.status === "pending" && existing.receiverId === me.id) {
      await db.friendship.update({ where: { id: existing.id }, data: { status: "accepted" } });
      return NextResponse.json({ status: "accepted", message: "You are now friends!" });
    }
  }

  await db.friendship.create({ data: { senderId: me.id, receiverId: target.id, status: "pending" } });
  return NextResponse.json({ status: "pending", message: `Friend request sent to ${target.username}` });
}
