export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders, clients, agencies, expeditionBatches, expeditionPlanEntries } from "@/db/schema";
import { and, eq, desc, ne, sql } from "drizzle-orm";
import { todayISO } from "@/lib/production-planning-constants";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { NOTIFICATION_EVENTS, notifyRoles } from "@/lib/notifications";

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

  const date = new URL(request.url).searchParams.get("date") || todayISO();
  const plans = await db.select().from(expeditionPlanEntries)
    .where(and(eq(expeditionPlanEntries.planDate, date), ne(expeditionPlanEntries.status, "ANNULE"), ne(expeditionPlanEntries.status, "TERMINE")))
    .orderBy(desc(expeditionPlanEntries.id));
  const batches = rawBatches.map(r => ({ ...r, driverName: r.driverName || null, plannedLoadingDate: r.plannedLoadingDate || null, note: r.note || null }));

  return NextResponse.json({ items, batches, plans, planDate: date });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "planification"].includes(user.role))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { itemId, batchQty, deliveryDate, driverName, plannedLoadingDate, note, planningId } = await request.json();
  if (!itemId || !batchQty) return NextResponse.json({ error: "itemId et batchQty requis" }, { status: 400 });

  const qty = parseInt(batchQty) || 0;
  if (qty <= 0) return NextResponse.json({ error: "Quantité > 0" }, { status: 400 });

  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, parseInt(itemId))).limit(1);
  if (!item) return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
  const [order] = await db.select({ productionStatus: orders.productionStatus, orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, item.orderId)).limit(1);
  if (order?.productionStatus === "ANNULEE") {
    return NextResponse.json({ error: "Impossible d'expédier une commande annulée" }, { status: 400 });
  }

  const currentDelivered = item.deliveredQty || 0;
  const remaining = item.quantity - currentDelivered;
  if (remaining <= 0) return NextResponse.json({ error: "Article déjà entièrement livré" }, { status: 400 });

  const actualQty = Math.min(qty, remaining);
  const newCumulative = currentDelivered + actualQty;
  const parsedPlanningId = planningId ? Number.parseInt(String(planningId), 10) : null;
  let linkedPlan: typeof expeditionPlanEntries.$inferSelect | null = null;
  if (parsedPlanningId && Number.isInteger(parsedPlanningId)) {
    const [plan] = await db.select().from(expeditionPlanEntries)
      .where(eq(expeditionPlanEntries.id, parsedPlanningId)).limit(1);
    if (!plan || plan.itemId !== item.id || plan.orderId !== item.orderId) {
      return NextResponse.json({ error: "Planning d'expédition invalide pour cet article" }, { status: 400 });
    }
    if (["ANNULE", "TERMINE"].includes(plan.status)) {
      return NextResponse.json({ error: "Ce planning d'expédition n'est plus actif" }, { status: 400 });
    }
    if (actualQty > plan.plannedQty - plan.loadedQty) {
      return NextResponse.json({ error: `Quantité restante sur le planning : ${plan.plannedQty - plan.loadedQty}` }, { status: 400 });
    }
    linkedPlan = plan;
  }

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

  if (linkedPlan) {
    const loadedQty = linkedPlan.loadedQty + actualQty;
    await db.update(expeditionPlanEntries).set({
      loadedQty,
      status: loadedQty >= linkedPlan.plannedQty ? "TERMINE" : "EN_COURS",
      updatedAt: new Date().toISOString(),
      updatedByName: user.fullName,
    }).where(eq(expeditionPlanEntries.id, linkedPlan.id));
  }

  // Check LIVREE
  const [all] = await db.select({
    tc: sql<number>`sum(${orderItems.quantity})`,
    td: sql<number>`sum(${orderItems.deliveredQty})`,
  }).from(orderItems).where(eq(orderItems.orderId, item.orderId));
  if (all && Number(all.td) >= Number(all.tc)) {
    const [order] = await db.select().from(orders).where(eq(orders.id, item.orderId)).limit(1);
    if (order && order.productionStatus !== "LIVREE") {
      await db.update(orders).set({ productionStatus: "LIVREE", updatedAt: new Date().toISOString() }).where(eq(orders.id, item.orderId));
      await notifyRoles(["commercial"], {
        eventKey: NOTIFICATION_EVENTS.ORDER_DELIVERED,
        type: "success",
        title: `Commande livrée #${order.orderNumber}`,
        message: `La commande ${order.orderNumber} a été entièrement livrée`,
        orderId: item.orderId,
        targetTab: "orders",
      });
    }
  }

  await logActivity(user.id, user.username, "EXPEDITION", `+${actualQty} de ${item.articleName} (total livré: ${newCumulative}/${item.quantity})`);
  return NextResponse.json({ ok: true, cumulative: newCumulative, remaining: item.quantity - newCumulative });
}
