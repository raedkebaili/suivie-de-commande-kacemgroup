export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { modificationLogs, orders } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";
import { agencyScopeForUser } from "@/lib/agency-access";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const agencyScope = agencyScopeForUser(user);
  if (agencyScope) {
    const [visibleOrder] = await db.select({ id: orders.id }).from(orders)
      .where(eq(orders.id, orderId)).limit(1);
    if (!visibleOrder) return NextResponse.json({ error: "Commande inaccessible" }, { status: 404 });
    const [order] = await db.select({ agencyId: orders.agencyId }).from(orders)
      .where(eq(orders.id, orderId)).limit(1);
    if (!order || !agencyScope.includes(order.agencyId)) return NextResponse.json({ error: "Commande inaccessible" }, { status: 404 });
  }
  const rows = await db.select().from(modificationLogs)
    .where(eq(modificationLogs.orderId, orderId))
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
