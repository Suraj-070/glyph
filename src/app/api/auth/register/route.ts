// POST /api/auth/register
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, setAuthSession } from "@/lib/session";
import { levelForXp } from "@/lib/types";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const ADJ = ["Neon","Quantum","Cyber","Solar","Lunar","Cosmic","Vivid","Hyper","Aero","Echo","Nova","Pixel","Vortex","Stealth","Prism","Zen","Flux","Apex","Onyx","Halo"];
const NOUN = ["Fox","Raven","Wolf","Falcon","Tiger","Drake","Comet","Cipher","Specter","Vector","Pulse","Spark","Blade","Rune","Shade","Glide","Trace","Forge","Glyph","Orbit"];
function rndUser() {
  return ADJ[Math.floor(Math.random()*ADJ.length)] + NOUN[Math.floor(Math.random()*NOUN.length)] + Math.floor(Math.random()*90+10);
}

export async function POST(req: Request) {
  let body: { email?: string; password?: string; username?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const username = (body.username ?? "").trim() || rndUser();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  if (username.length < 2 || username.length > 20)
    return NextResponse.json({ error: "Username must be 2-20 characters" }, { status: 400 });

  const [existingEmail, existingUsername] = await Promise.all([
    db.player.findUnique({ where: { email } }),
    db.player.findUnique({ where: { username } }),
  ]);
  if (existingEmail) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  if (existingUsername) return NextResponse.json({ error: "Username taken" }, { status: 409 });

  const player = await db.player.create({
    data: {
      id: randomUUID(),
      email,
      passwordHash: hashPassword(password),
      username,
      avatarSeed: username,
      authProvider: "credentials",
      status: "online",
      profile: { create: {} },
    },
  });

  await setAuthSession(player.id);
  return NextResponse.json({
    id: player.id, username: player.username, avatarSeed: player.avatarSeed,
    email: player.email, xp: player.xp, level: levelForXp(player.xp),
    rankPoints: player.rankPoints, status: player.status, authProvider: player.authProvider,
  });
}
