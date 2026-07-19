// POST /api/auth/logout
import { NextResponse } from "next/server";
import { clearAuthSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearAuthSession();
  return NextResponse.json({ ok: true });
}
