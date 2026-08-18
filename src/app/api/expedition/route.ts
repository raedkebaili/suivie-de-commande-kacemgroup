export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders, clients, agencies, expeditionBatches } from "@/db/schema";
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
    deliveryDate: orderItems.deliveryDate,
    orderNumber: orders.orderNumber, clientName: clients.name,
    agencyName: agencies.name, priority: orders.priority, status: orders.status,
    productionStatus: orders.productionStatus, affaire: orders.affaire,
  }).from(orderItems).leftJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(clients, eq(orders.clientId, clients.id))
    .leftJoin(agencies, eq(orders.agencyId, agencies.id))
    .orderBy(desc(orderItems.id)).limit(300);

  // Get batches with article name
  const rawBatches = await db.select({
    id: expeditionBatches.id, itemId: expeditionBatches.itemId, orderId: expeditionBatches.orderId,
    quantity: expeditionBatches.quantity, cumulativeTotal: expeditionBatches.cumulativeTotal,
    driverName: expeditionBatches.driverName, plannedLoadingDate: expeditionBatches.plannedLoadingDate,
    deliveredBy: expeditionBatches.deliveredBy, deliveryDate: expeditionBatches.deliveryDate,
    note: expeditionBatches.note, createdAt: expeditionBatches.createdAt,
    article_name: orderItems.articleName,
  }).from(expeditionBatches).innerJoin(orderItems, eq(orderItems.id, expeditionBatches.itemId))
    .orderBy(desc(expeditionBatches.createdAt)).limit(500);

  const batches = rawBatches.map(r => ({ ...r, driverName: r.driverName || null, plannedLoadingDate: r.plannedLoadingDate || null, note: r.note || null }));

  return NextResponse.json({ items, batches });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "planification"].includes(user.role))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { itemId, batchQty, deliveryDate, driverName, plannedLoadingDate, note } = await request.json();
  if (!itemId || !batchQty) return NextResponse.json({ error: "itemId et batchQty requis" }, { status: 400 });

  const qty = parseInt(batchQty) || 0;
  if (qty <= 0) return NextResponse.json({ error: "Quantité > 0" }, { status: 400 });

  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, parseInt(itemId))).limit(1);
  if (!item) return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
  const [order] = await db.select({ productionStatus: orders.productionStatus }).from(orders).where(eq(orders.id, item.orderId)).limit(1);
  if (order?.productionStatus === "ANNULEE") {
    return NextResponse.json({ error: "Impossible d'expédier une commande annulée" }, { status: 400 });
  }

  const currentDelivered = item.deliveredQty || 0;
  const remaining = item.quantity - currentDelivered;
  if (remaining <= 0) return NextResponse.json({ error: "Article déjà entièrement livré" }, { status: 400 });

  const actualQty = Math.min(qty, remaining);
  const newCumulative = currentDelivered + actualQty;

  // Insert batch
  await db.insert(expeditionBatches).values({
    itemId: item.id, orderId: item.orderId,
    quantity: actualQty, cumulativeTotal: newCumulative,
    driverName: driverName || null,
    plannedLoadingDate: plannedLoadingDate || null,
    deliveredBy: user.fullName,
    deliveryDate: deliveryDate || new Date().toISOString().split("T")[0],
    note: note || null,
  });

  // Update item
  await db.update(orderItems).set({
    deliveredQty: newCumulative,
    deliveryDate: deliveryDate || item.deliveryDate,
  }).where(eq(orderItems.id, item.id));

  // Check LIVREE
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

  await logActivity(user.id, user.username, "EXPEDITION", `+${actualQty} de ${item.articleName} (total livré: ${newCumulative}/${item.quantity})`);
  return NextResponse.json({ ok: true, cumulative: newCumulative, remaining: item.quantity - newCumulative });
}
