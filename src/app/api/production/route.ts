export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders, clients, agencies, productionBatches } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { applyProductionQuantity } from "@/lib/production-apply";

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "planification"].includes(user.role))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const items = await db.select({
    itemId: orderItems.id, orderId: orderItems.orderId,
    articleName: orderItems.articleName, quantity: orderItems.quantity,
    producedQty: orderItems.producedQty, deliveredQty: orderItems.deliveredQty,
    orderNumber: orders.orderNumber, clientName: clients.name,
    agencyName: agencies.name, priority: orders.priority, status: orders.status,
    productionStatus: orders.productionStatus, affaire: orders.affaire,
  }).from(orderItems).leftJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(clients, eq(orders.clientId, clients.id))
    .leftJoin(agencies, eq(orders.agencyId, agencies.id))
    .orderBy(desc(orderItems.id)).limit(300);

  // Get all batches for these items with article name
  const rawBatches = await db.select({
    id: productionBatches.id, itemId: productionBatches.itemId, orderId: productionBatches.orderId,
    quantity: productionBatches.quantity, cumulativeTotal: productionBatches.cumulativeTotal,
    producedBy: productionBatches.producedBy, productionDate: productionBatches.productionDate,
    createdAt: productionBatches.createdAt,
    article_name: orderItems.articleName,
  }).from(productionBatches).innerJoin(orderItems, eq(orderItems.id, productionBatches.itemId))
    .orderBy(desc(productionBatches.createdAt)).limit(500);

  return NextResponse.json({ items, batches: rawBatches });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "planification"].includes(user.role))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { itemId, batchQty, productionDate } = await request.json();
  if (!itemId || !batchQty) return NextResponse.json({ error: "itemId et batchQty requis" }, { status: 400 });

  // Logique partagée avec le planning de production (src/lib/production-apply.ts) :
  // lot, cumul, passage LIVREE, journalisation et promotion des priorités.
  const res = await applyProductionQuantity({
    itemId: parseInt(itemId),
    qty: parseInt(batchQty) || 0,
    productionDate,
    user,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  // Réponse inchangée par rapport au comportement d'origine
  return NextResponse.json({
    ok: true,
    cumulative: res.cumulative,
    remaining: res.remaining,
    priorityPromotion: res.priorityPromotion,
  });
}
