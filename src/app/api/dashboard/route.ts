export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, clients, agencies, orderItems } from "@/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const totalOrders = await db.select({ count: count() }).from(orders);
  const totalClients = await db.select({ count: count() }).from(clients);
  const totalAgencies = await db.select({ count: count() }).from(agencies);

  // Production pipeline state: EN_INSTANCE / EN_PRODUCTION / LIVREE / ANNULEE
  // This is the REAL lifecycle status of an order (orders.productionStatus),
  // NOT orders.status (which only ever holds SUR_STOCK / BON_COMMANDE / PREVISION).
  const psd = await db.select({ productionStatus: orders.productionStatus, count: count() })
    .from(orders).groupBy(orders.productionStatus);

  // Commercial state at order creation: SUR_STOCK / BON_COMMANDE / PREVISION
  const csd = await db.select({ status: orders.status, count: count() })
    .from(orders).groupBy(orders.status);

  const pd = await db.select({ priority: orders.priority, count: count() }).from(orders).groupBy(orders.priority);
  const ao = await db.select({ agencyName: agencies.name, count: count() }).from(orders).leftJoin(agencies, eq(orders.agencyId, agencies.id)).groupBy(agencies.name);

  const monthExpr = sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`;
  const mo = await db.select({ month: monthExpr.as("month"), count: count() }).from(orders).groupBy(monthExpr).orderBy(monthExpr).limit(6);

  // Global quantities across all order items: ordered / produced / delivered / remaining
  const [qty] = await db.select({
    totalOrdered: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
    totalProduced: sql<number>`coalesce(sum(${orderItems.producedQty}), 0)`,
    totalDelivered: sql<number>`coalesce(sum(${orderItems.deliveredQty}), 0)`,
  }).from(orderItems);

  const totalOrdered = Number(qty?.totalOrdered || 0);
  const totalProduced = Number(qty?.totalProduced || 0);
  const totalDelivered = Number(qty?.totalDelivered || 0);

  const productionStatusDistribution = {
    EN_INSTANCE: psd.find(s => s.productionStatus === "EN_INSTANCE")?.count || 0,
    EN_PRODUCTION: psd.find(s => s.productionStatus === "EN_PRODUCTION")?.count || 0,
    LIVREE: psd.find(s => s.productionStatus === "LIVREE")?.count || 0,
    ANNULEE: psd.find(s => s.productionStatus === "ANNULEE")?.count || 0,
  };

  const commercialStatusDistribution = {
    SUR_STOCK: csd.find(s => s.status === "SUR_STOCK")?.count || 0,
    BON_COMMANDE: csd.find(s => s.status === "BON_COMMANDE")?.count || 0,
    PREVISION: csd.find(s => s.status === "PREVISION")?.count || 0,
  };

  return NextResponse.json({
    totalOrders: totalOrders[0]?.count || 0,
    totalClients: totalClients[0]?.count || 0,
    totalAgencies: totalAgencies[0]?.count || 0,
    // Kept for backward compatibility with older clients; mirrors productionStatusDistribution.
    statusDistribution: productionStatusDistribution,
    productionStatusDistribution,
    commercialStatusDistribution,
    priorityDistribution: pd.reduce((acc, p) => ({ ...acc, [p.priority]: p.count }), {} as Record<string, number>),
    agencyOrders: ao.filter(a => a.agencyName),
    monthlyOrders: mo,
    quantities: {
      totalOrdered,
      totalProduced,
      totalDelivered,
      totalRemaining: Math.max(0, totalOrdered - totalDelivered),
    },
  });
}
