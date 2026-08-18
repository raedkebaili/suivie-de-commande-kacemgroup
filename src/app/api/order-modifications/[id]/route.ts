export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { modificationLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(modificationLogs)
    .where(eq(modificationLogs.orderId, parseInt(id)))
    .orderBy(desc(modificationLogs.createdAt))
    .limit(100);

  const logs = rows.map(r => ({
    id: r.id,
    orderId: r.orderId,
    userId: r.userId,
    username: r.username,
    field: r.field,
    oldValue: r.oldValue || null,
    newValue: r.newValue || null,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ logs });
}
