export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { db } from "@/db";

export async function POST(request: NextRequest) {
  try {
    // db ready
    const user = await getUserFromHeaders(request);
    if (user) await logActivity(user.id, user.username, "LOGOUT", "Déconnexion");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
