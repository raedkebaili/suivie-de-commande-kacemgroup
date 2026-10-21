import { db } from "@/db";
import { activityLogs, expeditionBatches, expeditionPlanEntries, orderItems, orders, productionBatches, productionPlanEntries } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { lockQuantityItem, reservedExpeditionQty } from "./quantity-transaction";

export type PlanningKind = "production" | "expedition";
export class PlanningUndoError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

/**
 * Les compteurs de la ligne sont la quantité réellement imputée (pas plannedQty).
 * Une écriture négative compense l'imputation sans effacer l'historique, y compris
 * pour les anciens lots sans lien au planning. Audit, lot, cumul et remise à zéro
 * font partie de la même transaction. Aucun montant reçu du client n'est utilisé.
 */
export async function undoPlanning(kind: PlanningKind, id: number, expectedUpdatedAt: string,
  user: { id: number; username: string; fullName: string }) {
  return db.transaction(async tx => {
    const table = kind === "production" ? productionPlanEntries : expeditionPlanEntries;
    const [reference] = await tx.select({ itemId: table.itemId }).from(table).where(eq(table.id, id)).limit(1);
    if (!reference) throw new PlanningUndoError("Ligne de planning introuvable", 404);
    const locked = await lockQuantityItem(tx, reference.itemId);
    if (!locked) throw new PlanningUndoError("Article introuvable", 404);
    const { item, order } = locked;
    const [entry] = await tx.select().from(table).where(eq(table.id, id)).for("update").limit(1);
    if (!entry) throw new PlanningUndoError("Ligne de planning introuvable", 404);
    if (entry.updatedAt !== expectedUpdatedAt) throw new PlanningUndoError("La ligne a changé. Actualisez le planning avant de confirmer à nouveau.");
    if (entry.itemId !== item.id || entry.orderId !== item.orderId) throw new PlanningUndoError("Planning incohérent avec l'article");
    if (item.producedQty < 0 || item.deliveredQty < 0) throw new PlanningUndoError("Cumuls incohérents : correction manuelle requise");
    const qty = "appliedQty" in entry ? entry.appliedQty : entry.loadedQty;
    if (!Number.isSafeInteger(qty) || qty < 0) throw new PlanningUndoError("Quantité imputée incohérente : correction manuelle requise");
    const initialStatus = kind === "production" ? "EN_ATTENTE" : "NON_TRAITE";
    if (entry.status === initialStatus && qty === 0 && !("appliedAt" in entry && entry.appliedAt)) {
      throw new PlanningUndoError("Cette ligne est déjà à son état initial");
    }
    // Un ancien état terminé sans preuve chiffrée ne permet pas une soustraction fiable.
    if (qty === 0 && ["TERMINE", "LIVRE"].includes(entry.status)) {
      throw new PlanningUndoError("La quantité réellement imputée est introuvable : aucune soustraction automatique n'a été faite");
    }
    const now = new Date().toISOString();
    let cumulative: number;
    if (kind === "production") {
      cumulative = item.producedQty - qty;
      if (cumulative < 0) throw new PlanningUndoError("Le cumul produit est inférieur à la quantité à annuler");
      if (cumulative < item.deliveredQty) throw new PlanningUndoError("Annulez d'abord les expéditions concernées : cette production a déjà été livrée");
      if (qty > 0) {
        if (await reservedExpeditionQty(tx, item.id) > cumulative - item.deliveredQty) {
          throw new PlanningUndoError("Ajustez ou annulez d'abord les plannings d'expédition qui réservent cette production");
        }
        await tx.insert(productionBatches).values({ itemId: item.id, orderId: item.orderId, quantity: -qty,
          cumulativeTotal: cumulative, producedBy: user.fullName, productionDate: now.slice(0, 10) });
        await tx.update(orderItems).set({ producedQty: cumulative }).where(eq(orderItems.id, item.id));
      }
      await tx.update(productionPlanEntries).set({ status: initialStatus, reason: null, appliedQty: 0, appliedAt: null,
        updatedAt: sql`clock_timestamp()`, updatedByName: user.fullName }).where(eq(productionPlanEntries.id, id));
    } else {
      cumulative = item.deliveredQty - qty;
      if (cumulative < 0) throw new PlanningUndoError("Le cumul livré est inférieur à la quantité à annuler");
      if (qty > 0) {
        await tx.insert(expeditionBatches).values({ itemId: item.id, orderId: item.orderId, quantity: -qty,
          cumulativeTotal: cumulative, deliveredBy: user.fullName, deliveryDate: now.slice(0, 10),
          driverName: "driverName" in entry ? entry.driverName : null, plannedLoadingDate: entry.planDate,
          note: `Retour à l'état initial du planning d'expédition #${id}` });
        await tx.update(orderItems).set({ deliveredQty: cumulative, deliveryDate: cumulative === 0 ? null : item.deliveryDate })
          .where(eq(orderItems.id, item.id));
      }
      await tx.update(expeditionPlanEntries).set({ status: initialStatus, loadedQty: 0, updatedAt: sql`clock_timestamp()`, updatedByName: user.fullName })
        .where(eq(expeditionPlanEntries.id, id));
    }
    // Prêt à livrer est dérivé des quantités. LIVREE, lui, doit être réouvert.
    // Ne jamais réactiver une commande annulée ni modifier son état commercial.
    let nextProductionStatus = order.productionStatus;
    if (order.productionStatus !== "ANNULEE") {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, item.orderId));
      const [active] = await tx.select({ id: productionPlanEntries.id }).from(productionPlanEntries)
        .where(and(eq(productionPlanEntries.orderId, item.orderId), inArray(productionPlanEntries.status, ["EN_COURS", "TERMINE"])) ).limit(1);
      const delivered = items.length > 0 && items.every(row => row.deliveredQty >= row.quantity);
      const started = items.some(row => row.producedQty > 0 || row.deliveredQty > 0) || Boolean(active);
      nextProductionStatus = delivered ? "LIVREE" : started ? "EN_PRODUCTION" : "EN_INSTANCE";
      await tx.update(orders).set({ productionStatus: nextProductionStatus, updatedAt: now })
        .where(eq(orders.id, item.orderId));
    }
    await tx.insert(activityLogs).values({ userId: user.id, username: user.username,
      action: kind === "production" ? "PLANNING_PRODUCTION_UNDO" : "PLANNING_EXPEDITION_UNDO",
      details: JSON.stringify({ planningId: id, orderId: item.orderId, itemId: item.id, article: item.articleName,
        previousStatus: entry.status, status: initialStatus, reversedQty: qty, plannedQty: entry.plannedQty,
        previousReason: "reason" in entry ? entry.reason : undefined,
        previousAppliedAt: "appliedAt" in entry ? entry.appliedAt : undefined,
        previousProductionStatus: order.productionStatus, productionStatus: nextProductionStatus,
        previousCumulative: kind === "production" ? item.producedQty : item.deliveredQty, cumulative,
        previousUpdatedAt: entry.updatedAt, actor: user.fullName }) });
    return { ok: true, reversedQty: qty, cumulative, status: initialStatus };
  });
}
