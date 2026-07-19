// GLYPH — session (cookie-based identity + auth helpers)
import { cookies } from "next/headers";
import { db } from "./db";
import { randomUUID, createHash } from "crypto";

export const SESSION_COOKIE = "glyph_player_id";
export const AUTH_COOKIE = "glyph_auth"; // for logged-in (non-guest) players

const ADJ = [
  "Neon","Quantum","Cyber","Solar","Lunar","Cosmic","Vivid","Hyper","Aero",
  "Echo","Nova","Pixel","Vortex","Stealth","Prism","Zen","Flux","Apex","Onyx","Halo",
];
const NOUN = [
  "Fox","Raven","Wolf","Falcon","Tiger","Drake","Comet","Cipher","Specter","Vector",
  "Pulse","Spark","Blade","Rune","Shade","Glide","Trace","Forge","Glyph","Orbit",
];

function randomUsername(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `${a}${n}${num}`;
}

export function hashPassword(password: string): string {
  // SHA-256 with a static app pepper + the password
  const pepper = process.env.GAME_TOKEN_SECRET ?? "glyph-dev-pepper";
  return createHash("sha256").update(pepper + password).digest("hex");
}

/**
 * Get or create the player for the current request.
 * Priority: auth cookie (registered user) → session cookie (guest) → create guest
 */
export async function getCurrentPlayer() {
  const store = await cookies();

  // 1. Check for registered auth session
  const authId = store.get(AUTH_COOKIE)?.value;
  if (authId) {
    const player = await db.player.findUnique({ where: { id: authId }, include: { profile: true } });
    if (player) return player;
    // cookie stale — clear it and fall through to guest
    store.delete(AUTH_COOKIE);
  }

  // 2. Guest cookie
  let id = store.get(SESSION_COOKIE)?.value;
  let player = id ? await db.player.findUnique({ where: { id }, include: { profile: true } }) : null;

  if (!player) {
    id = randomUUID();
    const username = randomUsername();
    player = await db.player.create({
      data: {
        id,
        username,
        avatarSeed: username,
        status: "online",
        authProvider: "guest",
        profile: { create: {} },
      },
      include: { profile: true },
    });
    store.set(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return player;
}

/** Set the auth cookie for a registered player (call after login/register). */
export async function setAuthSession(playerId: string) {
  const store = await cookies();
  store.set(AUTH_COOKIE, playerId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    secure: process.env.NODE_ENV === "production",
  });
}

/** Clear both cookies (logout). */
export async function clearAuthSession() {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
  store.delete(SESSION_COOKIE);
}

export async function getPlayerById(id: string) {
  return db.player.findUnique({
    where: { id },
    include: { profile: true, achievements: true },
  });
}
