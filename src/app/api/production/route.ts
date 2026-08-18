export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders, clients, agencies, productionBatches } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

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

  const qty = parseInt(batchQty) || 0;
  if (qty <= 0) return NextResponse.json({ error: "Quantité doit être > 0" }, { status: 400 });

  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, parseInt(itemId))).limit(1);
  if (!item) return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
  const [order] = await db.select({ productionStatus: orders.productionStatus }).from(orders).where(eq(orders.id, item.orderId)).limit(1);
  if (order?.productionStatus === "ANNULEE") {
    return NextResponse.json({ error: "Impossible de produire une commande annulée" }, { status: 400 });
  }

  // Check if we can still produce (produced <= ordered)
  const currentProduced = item.producedQty || 0;
  const remaining = item.quantity - currentProduced;
  if (remaining <= 0) return NextResponse.json({ error: "Cet article est déjà entièrement produit" }, { status: 400 });

  const actualQty = Math.min(qty, remaining);
  const newCumulative = currentProduced + actualQty;

  // Insert batch
  await db.insert(productionBatches).values({
    itemId: item.id, orderId: item.orderId,
    quantity: actualQty, cumulativeTotal: newCumulative,
    producedBy: user.fullName,
    productionDate: productionDate || new Date().toISOString().split("T")[0],
  });

  // Update item cumulative
  await db.update(orderItems).set({ producedQty: newCumulative }).where(eq(orderItems.id, item.id));

  // Check if all delivered -> LIVREE
  const [all] = await db.select({
    tc: sql<number>`sum(${orderItems.quantity})`,
    td: sql<number>`sum(${orderItems.deliveredQty})`,
  }).from(orderItems).where(eq(orderItems.orderId, item.orderId));
  if (all && Number(all.td) >= Number(all.tc)) {
    const [order] = await db.select().from(orders).where(eq(orders.id, item.orderId)).limit(1);
    if (order && order.productionStatus !== "LIVREE") {
      await db.update(orders).set({ productionStatus: "LIVREE", updatedAt: new Date().toISOString() }).where(eq(orders.id, item.orderId));
    }
  }

  await logActivity(user.id, user.username, "PRODUCTION", `+${actualQty} de ${item.articleName} (total: ${newCumulative}/${item.quantity})`);
  return NextResponse.json({ ok: true, cumulative: newCumulative, remaining: item.quantity - newCumulative });
}
