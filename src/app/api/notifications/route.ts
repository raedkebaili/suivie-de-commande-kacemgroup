export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const unread = sp.get("unread");
  const conds = [eq(notifications.userId, user.id)];
  if (unread === "1") conds.push(eq(notifications.read, false));
  const data = await db.select().from(notifications).where(and(...conds)).orderBy(desc(notifications.createdAt)).limit(50);
  return NextResponse.json({ notifications: data });
}
