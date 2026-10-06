export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { modificationLogs, orders } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";
import { agencyScopeForUser } from "@/lib/agency-access";

/**
 * GET /api/order-modifications?orderIds=1,2,3
 * Charge les journaux de plusieurs commandes en une seule requête.
 * Chaque commande conserve la même limite historique de 100 lignes.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const rawIds = new URL(request.url).searchParams.get("orderIds") || "";
  const orderIds = [...new Set(
    rawIds.split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0),
  )];

  if (orderIds.length === 0) {
    return NextResponse.json({ error: "Au moins une commande est requise" }, { status: 400 });
  }
  const agencyScope = agencyScopeForUser(user);
  let visibleOrderIds = orderIds;
  if (agencyScope) {
    const visible = await db.select({ id: orders.id }).from(orders)
      .where(inArray(orders.agencyId, agencyScope));
    const visibleSet = new Set(visible.map((order) => order.id));
    visibleOrderIds = orderIds.filter((id) => visibleSet.has(id));
  }
  if (visibleOrderIds.length === 0) return NextResponse.json({ modifications: [] });

  const rows = await db.select().from(modificationLogs)
    .where(inArray(modificationLogs.orderId, visibleOrderIds))
    .orderBy(desc(modificationLogs.createdAt));

  const grouped = new Map<number, typeof rows>();
  for (const row of rows) {
    const current = grouped.get(row.orderId) || [];
    if (current.length < 100) current.push(row);
    grouped.set(row.orderId, current);
  }

  return NextResponse.json({
    modifications: visibleOrderIds.map((orderId) => ({
      orderId,
      logs: (grouped.get(orderId) || []).map((row) => ({
        id: row.id,
        orderId: row.orderId,
        userId: row.userId,
        username: row.username,
        field: row.field,
        oldValue: row.oldValue || null,
        newValue: row.newValue || null,
        createdAt: row.createdAt,
      })),
    })),
  });
}
