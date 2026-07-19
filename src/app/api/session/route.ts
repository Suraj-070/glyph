// GET /api/session — get current player (guest or registered)
import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/session";
import { levelForXp } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const player = await getCurrentPlayer();
  return NextResponse.json({
    id: player.id,
    username: player.username,
    avatarSeed: player.avatarSeed,
    email: player.email ?? null,
    xp: player.xp,
    level: player.level || levelForXp(player.xp),
    rankPoints: player.rankPoints,
    status: player.status,
    authProvider: player.authProvider ?? "guest",
  });
}
