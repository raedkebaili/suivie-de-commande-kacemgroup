export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders, clients, agencies, expeditionBatches, expeditionPlanEntries } from "@/db/schema";
import { and, eq, desc, ne, sql } from "drizzle-orm";
import { lockQuantityItem, reservedExpeditionQty } from "@/lib/quantity-transaction";
import { todayISO } from "@/lib/production-planning-constants";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { NOTIFICATION_EVENTS, notifyRoles } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "planification", "gerant"].includes(user.role))
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
    .where(and(eq(expeditionPlanEntries.planDate, date), ne(expeditionPlanEntries.status, "ANNULE"), ne(expeditionPlanEntries.status, "LIVRE"), ne(expeditionPlanEntries.status, "TERMINE")))
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

  const parsedItemId = Number.parseInt(String(itemId), 10);
  const parsedPlanningId = planningId ? Number.parseInt(String(planningId), 10) : null;
  const actualDeliveryDate = deliveryDate || new Date().toISOString().split("T")[0];

  // L'article et, si besoin, sa ligne de planning sont verrouillés ensemble :
  // une double validation concurrente ne peut donc pas doubler le cumul livré.
  const result = await db.transaction(async (tx) => {
    const locked = await lockQuantityItem(tx, parsedItemId);
    if (!locked) return { ok: false as const, status: 404, error: "Article non trouvé" };
    const { item, order } = locked;
    if (order?.productionStatus === "ANNULEE") {
      return { ok: false as const, status: 400, error: "Impossible d'expédier une commande annulée" };
    }

    const [selectedPlan] = parsedPlanningId && Number.isInteger(parsedPlanningId)
      ? await tx.select().from(expeditionPlanEntries).where(eq(expeditionPlanEntries.id, parsedPlanningId)).for("update").limit(1)
      : [];
    const activePlans = await tx.select().from(expeditionPlanEntries).where(eq(expeditionPlanEntries.itemId, item.id));
    const stillPlanned = activePlans.filter((plan) => ["NON_TRAITE", "EN_COURS", "PLANIFIE"].includes(plan.status));
    if ((!parsedPlanningId || !Number.isInteger(parsedPlanningId)) && stillPlanned.length > 0) {
      return { ok: false as const, status: 409, error: "Cet article possède un planning d'expédition non livré : utilisez sa ligne de planning ou passez-la d'abord à Livré" };
    }
    if (parsedPlanningId && Number.isInteger(parsedPlanningId)) {
      if (!selectedPlan || selectedPlan.itemId !== item.id || selectedPlan.orderId !== item.orderId) {
        return { ok: false as const, status: 400, error: "Planning d'expédition invalide pour cet article" };
      }
      if (["ANNULE", "LIVRE", "TERMINE"].includes(selectedPlan.status)) {
        return { ok: false as const, status: 400, error: "Ce planning d'expédition n'est plus actif" };
      }
    }

    const currentDelivered = item.deliveredQty || 0;
    const remaining = Math.max(0, (item.producedQty || 0) - currentDelivered);
    if (remaining <= 0) return { ok: false as const, status: 400, error: "Aucune quantité produite disponible à livrer" };
    const actualQty = Math.min(qty, remaining);
    if (selectedPlan && actualQty > selectedPlan.plannedQty - selectedPlan.loadedQty) {
      return { ok: false as const, status: 400, error: `Quantité restante sur le planning : ${selectedPlan.plannedQty - selectedPlan.loadedQty}` };
    }
    if (actualQty > remaining - await reservedExpeditionQty(tx, item.id, selectedPlan?.id)) {
      return { ok: false as const, status: 409, error: "Quantité réservée par un autre planning d'expédition : ajustez les lignes concernées" };
    }
    const newCumulative = currentDelivered + actualQty;
    await tx.insert(expeditionBatches).values({
      itemId: item.id, orderId: item.orderId,
      quantity: actualQty, cumulativeTotal: newCumulative,
      driverName: driverName || selectedPlan?.driverName || null,
      plannedLoadingDate: plannedLoadingDate || selectedPlan?.planDate || null,
      deliveredBy: user.fullName,
      deliveryDate: actualDeliveryDate,
      note: note || selectedPlan?.note || null,
    });
    await tx.update(orderItems).set({ deliveredQty: newCumulative, deliveryDate: actualDeliveryDate }).where(eq(orderItems.id, item.id));
    if (selectedPlan) {
      const loadedQty = selectedPlan.loadedQty + actualQty;
      await tx.update(expeditionPlanEntries).set({
        loadedQty,
        status: loadedQty >= selectedPlan.plannedQty ? "LIVRE" : "EN_COURS",
        updatedAt: sql`clock_timestamp()`,
        updatedByName: user.fullName,
      }).where(eq(expeditionPlanEntries.id, selectedPlan.id));
    }
    const allItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, item.orderId));
    const fullyDelivered = allItems.every(row => row.deliveredQty >= row.quantity);
    const becameDelivered = fullyDelivered && order.productionStatus !== "LIVREE";
    if (becameDelivered) await tx.update(orders).set({ productionStatus: "LIVREE", updatedAt: new Date().toISOString() }).where(eq(orders.id, item.orderId));
    return { ok: true as const, item, actualQty, newCumulative, becameDelivered, orderNumber: order.orderNumber };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { item, actualQty, newCumulative } = result;

  if (result.becameDelivered) {
    try {
      await notifyRoles(["commercial"], { eventKey: NOTIFICATION_EVENTS.ORDER_DELIVERED, type: "success",
        title: `Commande livrée #${result.orderNumber}`, message: `La commande ${result.orderNumber} a été entièrement livrée`,
        orderId: item.orderId, targetTab: "orders" });
    } catch (error) { console.error("Notification livraison:", error); }
  }

  await logActivity(user.id, user.username, "EXPEDITION", `+${actualQty} de ${item.articleName} (total livré: ${newCumulative}/${item.quantity})`);
  return NextResponse.json({ ok: true, cumulative: newCumulative, remaining: item.quantity - newCumulative });
}
