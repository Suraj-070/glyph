// GLYPH — lightweight local session (cookie-based player identity)
// No external auth required for the demo, but mirrors a real auth flow.
import { cookies } from "next/headers";
import { db } from "./db";
import { randomUUID } from "crypto";

export const SESSION_COOKIE = "glyph_player_id";

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

/**
 * Get or create the local player for the current request.
 * Server-only.
 */
export async function getCurrentPlayer() {
  const store = await cookies();
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

/** Lookup a player by id (server-only). */
export async function getPlayerById(id: string) {
  return db.player.findUnique({
    where: { id },
    include: { profile: true, achievements: true },
  });
}
