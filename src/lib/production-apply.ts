/**
 * Application d'une quantité produite — SOURCE UNIQUE DE VÉRITÉ.
 *
 * Extrait de POST /api/production pour être partagé avec le planning de
 * production (passage d'une ligne au statut « Terminé »). Centraliser cette
 * logique garantit que les deux chemins produisent exactement les mêmes
 * effets : lot de production, cumul sur l'article, passage éventuel en
 * LIVREE, journalisation et promotion automatique des priorités.
 *
 * Écriture atomique lot / cumul / planning, avec verrou partagé par les retours.
 */
import { db } from "@/db";
import { orderItems, orders, productionBatches, productionPlanEntries, activityLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { lockQuantityItem } from "./quantity-transaction";
import { logActivity } from "@/lib/auth";
import { NOTIFICATION_EVENTS, notifyRoles } from "@/lib/notifications";
import { isOrderFullyProduced, promotePrioritiesAfterCompletion } from "@/lib/priority-promotion";

export type ApplyProductionResult =
  | { ok: true; actualQty: number; cumulative: number; remaining: number; articleName: string;
      priorityPromotion: Awaited<ReturnType<typeof promotePrioritiesAfterCompletion>> | null }
  | { ok: false; status: number; error: string };

export async function applyProductionQuantity(params: {
  itemId: number;
  qty: number;
  productionDate?: string | null;
  user: { id: number; username: string; fullName: string };
  /** Suffixe ajouté au journal d'activité (ex. origine « planning ») */
  logSuffix?: string;
  planning?: { id: number; expectedUpdatedAt: string; updates: Record<string, unknown> };
}): Promise<ApplyProductionResult> {
  const { itemId, qty, productionDate, user, logSuffix } = params;

  if (!Number.isFinite(itemId) || !Number.isFinite(qty) || qty <= 0) {
    return { ok: false, status: 400, error: "Quantité doit être > 0" };
  }

  const result = await db.transaction(async tx => {
    const locked = await lockQuantityItem(tx, itemId);
    if (!locked) return { ok: false as const, status: 404, error: "Article non trouvé" };
    const { item, order } = locked;
    if (order.productionStatus === "ANNULEE") return { ok: false as const, status: 400, error: "Impossible de produire une commande annulée" };
    if (params.planning) {
      const [entry] = await tx.select().from(productionPlanEntries).where(eq(productionPlanEntries.id, params.planning.id)).for("update").limit(1);
      if (!entry || entry.itemId !== item.id || entry.orderId !== item.orderId) return { ok: false as const, status: 404, error: "Planning introuvable" };
      if (entry.appliedAt || entry.appliedQty > 0 || entry.updatedAt !== params.planning.expectedUpdatedAt) {
        return { ok: false as const, status: 409, error: "La ligne a changé ou a déjà été appliquée. Actualisez le planning." };
      }
    }
    const remaining = item.quantity - item.producedQty;
    if (remaining <= 0) return { ok: false as const, status: 400, error: "Cet article est déjà entièrement produit" };
    const actualQty = Math.min(qty, remaining);
    const newCumulative = item.producedQty + actualQty;
    await tx.insert(productionBatches).values({ itemId: item.id, orderId: item.orderId, quantity: actualQty,
      cumulativeTotal: newCumulative, producedBy: user.fullName,
      productionDate: productionDate || new Date().toISOString().split("T")[0] });
    await tx.update(orderItems).set({ producedQty: newCumulative }).where(eq(orderItems.id, item.id));
    if (params.planning) {
      await tx.update(productionPlanEntries).set({ ...params.planning.updates, updatedAt: sql`clock_timestamp()`, status: "TERMINE", appliedQty: actualQty,
        appliedAt: new Date().toISOString() }).where(eq(productionPlanEntries.id, params.planning.id));
    }
    await tx.insert(activityLogs).values({ userId: user.id, username: user.username, action: "PRODUCTION",
      details: `+${actualQty} de ${item.articleName} (total: ${newCumulative}/${item.quantity})${logSuffix ? ` ${logSuffix}` : ""}` });
    const allItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, item.orderId));
    const fullyDelivered = allItems.every(row => row.deliveredQty >= row.quantity);
    const becameDelivered = fullyDelivered && order.productionStatus !== "LIVREE";
    if (becameDelivered) await tx.update(orders).set({ productionStatus: "LIVREE", updatedAt: new Date().toISOString() }).where(eq(orders.id, item.orderId));
    return { ok: true as const, item, order, actualQty, newCumulative, fullyDelivered, becameDelivered };
  });
  if (!result.ok) return result;
  const { item, order, actualQty, newCumulative, fullyDelivered } = result;
  if (result.becameDelivered) {
    try {
      await notifyRoles(["commercial"], { eventKey: NOTIFICATION_EVENTS.ORDER_DELIVERED, type: "success",
        title: `Commande livrée #${order.orderNumber}`, message: `La commande ${order.orderNumber} a été entièrement livrée`,
        orderId: item.orderId, targetTab: "orders" });
    } catch (error) { console.error("Notification livraison:", error); }
  }

  // Une commande devient « prête » lorsque tous ses articles sont produits,
  // avant la livraison. Cette vérification est faite après chaque lot mais
  // une ligne déjà entièrement produite est refusée plus haut : aucun doublon.
  let priorityPromotion: Awaited<ReturnType<typeof promotePrioritiesAfterCompletion>> | null = null;
  try {
    const fullyProduced = await isOrderFullyProduced(item.orderId);
    if (fullyProduced && !fullyDelivered && order && order.productionStatus !== "LIVREE") {
      await notifyRoles(["commercial"], {
        eventKey: NOTIFICATION_EVENTS.ORDER_READY,
        type: "success",
        title: `Commande prête #${order.orderNumber}`,
        message: `La commande ${order.orderNumber} est entièrement produite et prête à être livrée`,
        orderId: item.orderId,
        targetTab: "orders",
      });
    }
    if (fullyProduced) {
      priorityPromotion = await promotePrioritiesAfterCompletion(item.orderId, { id: user.id, fullName: user.fullName });
      if (priorityPromotion.promoted.length > 0) {
        await logActivity(user.id, user.username, "PRIORITY_PROMOTION",
          `Production terminée → ${priorityPromotion.promoted.length} commande(s) promue(s): ` +
          priorityPromotion.promoted.map(p => `#${p.orderNumber} ${p.from}→${p.to}`).join(", "));
      }
    }
  } catch (e) {
    // Ne doit jamais faire échouer l'enregistrement du lot produit
    console.error("Notification ou promotion de production:", e);
  }

  return { ok: true, actualQty, cumulative: newCumulative, remaining: item.quantity - newCumulative, articleName: item.articleName, priorityPromotion };
}
