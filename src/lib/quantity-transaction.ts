import { db } from "@/db";
import { orderItems, orders, expeditionPlanEntries } from "@/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

export type QuantityTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Ordre de verrouillage commun aux écritures : commande → article → planning. */
export async function lockQuantityItem(tx: QuantityTransaction, itemId: number) {
  const [reference] = await tx.select({ orderId: orderItems.orderId }).from(orderItems).where(eq(orderItems.id, itemId)).limit(1);
  if (!reference) return null;
  const [order] = await tx.select().from(orders).where(eq(orders.id, reference.orderId)).for("no key update").limit(1);
  const [item] = await tx.select().from(orderItems).where(eq(orderItems.id, itemId)).for("update").limit(1);
  return order && item && item.orderId === order.id ? { order, item } : null;
}

export async function reservedExpeditionQty(tx: QuantityTransaction, itemId: number, exceptId?: number) {
  const [total] = await tx.select({ qty: sql<number>`coalesce(sum(greatest(${expeditionPlanEntries.plannedQty} - ${expeditionPlanEntries.loadedQty}, 0)), 0)` })
    .from(expeditionPlanEntries).where(and(eq(expeditionPlanEntries.itemId, itemId),
      inArray(expeditionPlanEntries.status, ["NON_TRAITE", "PLANIFIE", "EN_COURS"]),
      exceptId === undefined ? undefined : ne(expeditionPlanEntries.id, exceptId)));
  return Number(total.qty);
}
