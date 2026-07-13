// GET /api/seed — idempotently seed bot players + befriend them with the current player.
// Makes the leaderboard & friends-online feel alive in the demo.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";
import { levelForXp, rankForPoints } from "@/lib/types";

export const dynamic = "force-dynamic";

const BOTS = [
  { username: "NeonCipher", xp: 9200, rankPoints: 8400, status: "playing" },
  { username: "QuantumFox", xp: 7100, rankPoints: 6200, status: "online" },
  { username: "CyberRaven", xp: 6400, rankPoints: 5400, status: "online" },
  { username: "SolarDrake", xp: 5200, rankPoints: 4100, status: "idle" },
  { username: "LunarWolf", xp: 4800, rankPoints: 3600, status: "playing" },
  { username: "CosmicFalcon", xp: 4100, rankPoints: 3100, status: "online" },
  { username: "VividTiger", xp: 3600, rankPoints: 2500, status: "online" },
  { username: "HyperComet", xp: 3000, rankPoints: 2000, status: "idle" },
  { username: "AeroVector", xp: 2600, rankPoints: 1600, status: "online" },
  { username: "EchoPulse", xp: 2100, rankPoints: 1200, status: "offline" },
  { username: "PixelBlade", xp: 1700, rankPoints: 900, status: "online" },
  { username: "VortexRune", xp: 1300, rankPoints: 600, status: "online" },
];

export async function GET() {
  const me = await getCurrentPlayer();

  // Ensure bots exist
  const created: string[] = [];
  for (const b of BOTS) {
    const existing = await db.player.findUnique({ where: { username: b.username } });
    if (!existing) {
      const bot = await db.player.create({
        data: {
          username: b.username,
          avatarSeed: b.username,
          xp: b.xp,
          level: levelForXp(b.xp),
          rankPoints: b.rankPoints,
          status: b.status as string,
          profile: {
            create: {
              totalGames: Math.floor(Math.random() * 120) + 30,
              wins: Math.floor(Math.random() * 80) + 20,
              currentStreak: Math.floor(Math.random() * 18),
              longestStreak: Math.floor(Math.random() * 40) + 5,
            },
          },
        },
      });
      created.push(bot.id);
    }
  }

  // Befriend all bots with the current player (accepted)
  const allBots = await db.player.findMany({
    where: { username: { in: BOTS.map((b) => b.username) } },
    select: { id: true },
  });
  for (const bot of allBots) {
    if (bot.id === me.id) continue;
    await db.friendship.upsert({
      where: {
        senderId_receiverId: { senderId: me.id, receiverId: bot.id },
      },
      update: { status: "accepted" },
      create: { senderId: me.id, receiverId: bot.id, status: "accepted" },
    }).catch(() => {});
  }

  return NextResponse.json({
    seeded: created.length,
    totalBots: allBots.length,
    friendsLinked: allBots.filter((b) => b.id !== me.id).length,
  });
}
