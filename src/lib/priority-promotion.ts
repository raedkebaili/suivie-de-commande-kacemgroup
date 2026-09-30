/**
 * Promotion automatique des priorités (planification) — logique serveur.
 *
 * Règle métier demandée :
 *   Lorsqu'une commande de la file priorisée est TERMINÉE EN PRODUCTION
 *   (quantité commandée = quantité produite pour tous ses articles),
 *   elle libère son rang et toutes les commandes situées en dessous
 *   remontent d'un cran.
 *
 *   Exemple : cmd1 = Priorité 1, cmd2 = Priorité 2, cmd3 = Normale.
 *   cmd1 terminée  →  cmd2 devient Priorité 1, cmd3 reste Normale.
 *
 * Précautions :
 *   - seules les commandes à priorité NUMÉROTÉE (P1…P10) sont concernées ;
 *     « Normale » et les valeurs historiques ne sont jamais déplacées ;
 *   - les commandes annulées ou déjà terminées ne remontent pas ;
 *   - la commande terminée sort de la file (passe à « Normale ») pour
 *     éviter deux commandes au même rang ;
 *   - chaque changement est tracé dans modification_logs (traçabilité
 *     identique au reste de l'application).
 */
import { db } from "@/db";
import { orderItems, orders, modificationLogs } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { isNumericPriority, priorityFromLevel, priorityLabel, priorityLevel } from "./priority";

/** true si TOUS les articles de la commande sont entièrement produits */
export async function isOrderFullyProduced(orderId: number): Promise<boolean> {
  const [totals] = await db
    .select({
      totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
      totalProduced: sql<number>`coalesce(sum(${orderItems.producedQty}), 0)`,
      itemCount: sql<number>`count(*)`,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  if (!totals || Number(totals.itemCount) === 0) return false;
  const qty = Number(totals.totalQty);
  const produced = Number(totals.totalProduced);
  return qty > 0 && produced >= qty;
}

export type PromotionResult = {
  promoted: { orderId: number; orderNumber: string; from: string; to: string }[];
  releasedLevel: number | null;
};

/**
 * Applique la promotion après l'achèvement en production d'une commande.
 * Sans effet si la commande n'était pas dans la file numérotée.
 */
export async function promotePrioritiesAfterCompletion(
  completedOrderId: number,
  actor: { id: number; fullName: string },
): Promise<PromotionResult> {
  const empty: PromotionResult = { promoted: [], releasedLevel: null };

  const [completed] = await db.select().from(orders).where(eq(orders.id, completedOrderId)).limit(1);
  if (!completed) return empty;

  const releasedLevel = priorityLevel(completed.priority);
  if (releasedLevel === null) return empty; // pas dans la file priorisée

  const now = new Date().toISOString();

  // 1) La commande terminée libère son rang
  await db.update(orders)
    .set({ priority: "NORMALE", updatedAt: now })
    .where(eq(orders.id, completedOrderId));
  await db.insert(modificationLogs).values({
    orderId: completedOrderId,
    userId: actor.id,
    username: actor.fullName,
    field: "Priorité (production terminée)",
    oldValue: priorityLabel(completed.priority),
    newValue: "Normale",
  });

  // 2) Les commandes situées en dessous remontent d'un cran.
  //    On exclut les commandes annulées ou livrées : elles ne sont plus en file.
  const candidates = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, priority: orders.priority, productionStatus: orders.productionStatus })
    .from(orders)
    .where(and(ne(orders.id, completedOrderId), ne(orders.productionStatus, "ANNULEE")));

  const toPromote = candidates
    .filter((o) => isNumericPriority(o.priority))
    .filter((o) => (priorityLevel(o.priority) as number) > releasedLevel)
    .filter((o) => o.productionStatus !== "LIVREE")
    .sort((a, b) => (priorityLevel(a.priority) as number) - (priorityLevel(b.priority) as number));

  const promoted: PromotionResult["promoted"] = [];
  for (const order of toPromote) {
    const current = priorityLevel(order.priority) as number;
    const next = priorityFromLevel(current - 1);
    if (!next) continue;
    await db.update(orders).set({ priority: next, updatedAt: now }).where(eq(orders.id, order.id));
    await db.insert(modificationLogs).values({
      orderId: order.id,
      userId: actor.id,
      username: actor.fullName,
      field: "Priorité (promotion automatique)",
      oldValue: priorityLabel(order.priority),
      newValue: priorityLabel(next),
    });
    promoted.push({ orderId: order.id, orderNumber: order.orderNumber, from: priorityLabel(order.priority), to: priorityLabel(next) });
  }

  return { promoted, releasedLevel };
}
