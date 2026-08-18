export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "100");
  const userId = searchParams.get("userId");
  const logs = userId
    ? await db.select().from(activityLogs).where(eq(activityLogs.userId, parseInt(userId))).orderBy(desc(activityLogs.createdAt)).limit(limit)
    : await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit);
  return NextResponse.json({ logs });
}
