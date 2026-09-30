/**
 * Application d'une quantité produite — SOURCE UNIQUE DE VÉRITÉ.
 *
 * Extrait de POST /api/production pour être partagé avec le planning de
 * production (passage d'une ligne au statut « Terminé »). Centraliser cette
 * logique garantit que les deux chemins produisent exactement les mêmes
 * effets : lot de production, cumul sur l'article, passage éventuel en
 * LIVREE, journalisation et promotion automatique des priorités.
 *
 * Le comportement est strictement identique à celui d'origine.
 */
import { db } from "@/db";
import { orderItems, orders, productionBatches } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { logActivity } from "@/lib/auth";
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
}): Promise<ApplyProductionResult> {
  const { itemId, qty, productionDate, user, logSuffix } = params;

  if (!Number.isFinite(itemId) || !Number.isFinite(qty) || qty <= 0) {
    return { ok: false, status: 400, error: "Quantité doit être > 0" };
  }

  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, itemId)).limit(1);
  if (!item) return { ok: false, status: 404, error: "Article non trouvé" };

  const [order] = await db
    .select({ productionStatus: orders.productionStatus })
    .from(orders).where(eq(orders.id, item.orderId)).limit(1);
  if (order?.productionStatus === "ANNULEE") {
    return { ok: false, status: 400, error: "Impossible de produire une commande annulée" };
  }

  // Contrôle : produit ne peut pas dépasser commandé
  const currentProduced = item.producedQty || 0;
  const remaining = item.quantity - currentProduced;
  if (remaining <= 0) {
    return { ok: false, status: 400, error: "Cet article est déjà entièrement produit" };
  }

  const actualQty = Math.min(qty, remaining);
  const newCumulative = currentProduced + actualQty;

  await db.insert(productionBatches).values({
    itemId: item.id,
    orderId: item.orderId,
    quantity: actualQty,
    cumulativeTotal: newCumulative,
    producedBy: user.fullName,
    productionDate: productionDate || new Date().toISOString().split("T")[0],
  });

  await db.update(orderItems).set({ producedQty: newCumulative }).where(eq(orderItems.id, item.id));

  // Passage en LIVREE si tout est livré (logique d'origine conservée)
  const [all] = await db.select({
    tc: sql<number>`sum(${orderItems.quantity})`,
    td: sql<number>`sum(${orderItems.deliveredQty})`,
  }).from(orderItems).where(eq(orderItems.orderId, item.orderId));
  if (all && Number(all.td) >= Number(all.tc)) {
    const [full] = await db.select().from(orders).where(eq(orders.id, item.orderId)).limit(1);
    if (full && full.productionStatus !== "LIVREE") {
      await db.update(orders)
        .set({ productionStatus: "LIVREE", updatedAt: new Date().toISOString() })
        .where(eq(orders.id, item.orderId));
    }
  }

  await logActivity(user.id, user.username, "PRODUCTION",
    `+${actualQty} de ${item.articleName} (total: ${newCumulative}/${item.quantity})${logSuffix ? ` ${logSuffix}` : ""}`);

  // Promotion automatique des priorités si la commande est entièrement produite
  let priorityPromotion: Awaited<ReturnType<typeof promotePrioritiesAfterCompletion>> | null = null;
  try {
    if (await isOrderFullyProduced(item.orderId)) {
      priorityPromotion = await promotePrioritiesAfterCompletion(item.orderId, { id: user.id, fullName: user.fullName });
      if (priorityPromotion.promoted.length > 0) {
        await logActivity(user.id, user.username, "PRIORITY_PROMOTION",
          `Production terminée → ${priorityPromotion.promoted.length} commande(s) promue(s): ` +
          priorityPromotion.promoted.map(p => `#${p.orderNumber} ${p.from}→${p.to}`).join(", "));
      }
    }
  } catch (e) {
    // Ne doit jamais faire échouer l'enregistrement du lot produit
    console.error("Promotion des priorités:", e);
  }

  return { ok: true, actualQty, cumulative: newCumulative, remaining: item.quantity - newCumulative, articleName: item.articleName, priorityPromotion };
}
