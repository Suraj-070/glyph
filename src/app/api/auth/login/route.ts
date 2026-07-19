// POST /api/auth/login
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, setAuthSession } from "@/lib/session";
import { levelForXp } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: string; password?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password)
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });

  const player = await db.player.findUnique({ where: { email } });
  if (!player?.passwordHash || player.passwordHash !== hashPassword(password))
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  await setAuthSession(player.id);
  return NextResponse.json({
    id: player.id, username: player.username, avatarSeed: player.avatarSeed,
    email: player.email, xp: player.xp, level: levelForXp(player.xp),
    rankPoints: player.rankPoints, status: player.status, authProvider: player.authProvider,
  });
}
