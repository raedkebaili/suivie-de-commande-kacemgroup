import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { orders, orderItems, productionBatches, expeditionBatches, productionPlanEntries } from "@/db/schema";
import { MATERIAL_DEMAND_COMMERCIAL_STATUSES, MATERIAL_DEMAND_PRODUCTION_STATUS } from "./material-demand-policy";

/**
 * Condition SQL obligatoire, AVANT collecte des composants, filtres et agrégation.
 * Le statut commercial ne remplace pas l'état de production. Les quantités et le
 * planning protègent aussi contre un statut EN_INSTANCE non actualisé.
 * Exclusion à l'échelle de la commande : pas de « besoin neuf » pour ses autres
 * articles quand une partie est déjà engagée. Aucun calcul quantité - livré.
 * SUSPENDU seul peut signifier une attente de matière avant démarrage : sans
 * preuve de traitement, il ne faut pas faire disparaître ce besoin.
 * Les lots sont évalués en solde par article : un retour arrière compensatoire
 * conserve l’historique mais annule son effet, sans compensation entre articles.
 */
export function materialDemandScope() {
  return and(
    inArray(orders.status, [...MATERIAL_DEMAND_COMMERCIAL_STATUSES]),
    eq(orders.productionStatus, MATERIAL_DEMAND_PRODUCTION_STATUS),
    gt(orderItems.quantity, 0),
    sql`NOT EXISTS (
      SELECT 1 FROM ${orderItems} AS material_scope_item
      WHERE material_scope_item.order_id = ${orders.id}
        AND (material_scope_item.produced_qty <> 0 OR material_scope_item.delivered_qty <> 0)
    )`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${productionBatches}
      WHERE ${productionBatches.orderId} = ${orders.id}
      GROUP BY ${productionBatches.itemId} HAVING sum(${productionBatches.quantity}) <> 0
    )`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${expeditionBatches}
      WHERE ${expeditionBatches.orderId} = ${orders.id}
      GROUP BY ${expeditionBatches.itemId} HAVING sum(${expeditionBatches.quantity}) <> 0
    )`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${productionPlanEntries}
      WHERE ${productionPlanEntries.orderId} = ${orders.id}
        AND (${productionPlanEntries.status} IN ('EN_COURS', 'TERMINE')
          OR ${productionPlanEntries.appliedQty} <> 0 OR ${productionPlanEntries.appliedAt} IS NOT NULL)
    )`,
  )!;
}
