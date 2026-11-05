import { sql, type SQL } from "drizzle-orm";
import { todayISO } from "./production-planning-constants";
import { orders, orderItems } from "@/db/schema";
import { isWorkflowFilter } from "./workflow-filters";

/** Prédicat partagé : portée explicite commande entière ou article. */
export function workflowFilterSQL(key: string | null, itemScope = false): SQL | undefined {
  if (!key) return undefined;
  if (!isWorkflowFilter(key)) throw new Error("Filtre d’avancement invalide");
  return strictWorkflowFilterSQL(key, itemScope);
}

/** V2 : état d'un même article, jamais une somme ou un planning d'un autre article. */
function strictWorkflowFilterSQL(key: string, itemScope: boolean): SQL {
  const [scope, state] = key.split(":");
  const production = scope.startsWith("prod-");
  const article = scope.endsWith("-item");
  const cancelledOrder = sql`(COALESCE(${orders.productionStatus} = 'ANNULEE', false) OR COALESCE(${orders.status} = 'ANNULEE', false))`;
  // Une ligne annulée historique ne doit pas annuler une nouvelle planification.
  // La date de création/id prime sur la date de travail, qui peut être future.
  const prodStatus = sql`(SELECT p.status FROM production_plan_entries p WHERE p.item_id = wf_i.id AND p.order_id = wf_i.order_id ORDER BY p.id DESC LIMIT 1)`;
  const shipStatus = sql`(SELECT e.status FROM expedition_plan_entries e WHERE e.item_id = wf_i.id AND e.order_id = wf_i.order_id ORDER BY e.id DESC LIMIT 1)`;
  const activeProd = sql`EXISTS (SELECT 1 FROM production_plan_entries p WHERE p.item_id = wf_i.id AND p.order_id = wf_i.order_id AND p.status IN ('EN_ATTENTE', 'EN_COURS', 'SUSPENDU'))`;
  const activeShip = sql`EXISTS (SELECT 1 FROM expedition_plan_entries e WHERE e.item_id = wf_i.id AND e.order_id = wf_i.order_id AND e.status IN ('NON_TRAITE', 'PLANIFIE', 'EN_COURS'))`;
  const prodCancelled = sql`(COALESCE(${prodStatus} = 'ANNULE', false) AND NOT ${activeProd})`;
  const shipCancelled = sql`(COALESCE(${shipStatus} = 'ANNULE', false) AND NOT ${activeShip})`;
  const lineCancelled = production ? prodCancelled : sql`(${prodCancelled} OR ${shipCancelled})`;
  const ready = sql`(wf_i.produced_qty >= wf_i.quantity AND wf_i.delivered_qty < wf_i.quantity)`;
  const delivered = sql`wf_i.delivered_qty >= wf_i.quantity`;
  const noProdPlan = sql`NOT EXISTS (SELECT 1 FROM production_plan_entries p WHERE p.item_id = wf_i.id AND p.order_id = wf_i.order_id AND p.status <> 'ANNULE')`;
  const noShipPlan = sql`NOT EXISTS (SELECT 1 FROM expedition_plan_entries e WHERE e.item_id = wf_i.id AND e.order_id = wf_i.order_id AND e.status <> 'ANNULE')`;
  let condition: SQL;
  switch (state) {
    case "CANCELLED": condition = lineCancelled; break;
    case "READY": condition = sql`(${ready} AND NOT ${prodCancelled} AND NOT ${shipCancelled} ${article ? sql`` : sql`AND wf_i.delivered_qty = 0`})`; break;
    case "DELIVERED": condition = delivered; break;
    case "ACTIVE": condition = sql`(wf_i.produced_qty < wf_i.quantity AND wf_i.delivered_qty < wf_i.quantity AND NOT ${prodCancelled} AND EXISTS (
      SELECT 1 FROM production_plan_entries p WHERE p.item_id = wf_i.id AND p.order_id = wf_i.order_id
      AND p.status = 'EN_COURS' AND p.plan_date <= ${todayISO()}))`; break;
    case "PLANNED": condition = sql`(${activeProd} AND NOT ${prodCancelled} AND wf_i.produced_qty < wf_i.quantity AND wf_i.delivered_qty < wf_i.quantity)`; break;
    case "UNPLANNED": condition = production
      ? sql`(${noProdPlan} AND NOT ${prodCancelled} AND wf_i.produced_qty < wf_i.quantity AND wf_i.delivered_qty < wf_i.quantity)`
      : article
        ? sql`(${noProdPlan} AND NOT ${prodCancelled} AND NOT ${shipCancelled} AND wf_i.produced_qty < wf_i.quantity AND wf_i.delivered_qty < wf_i.quantity)`
        : sql`(${noShipPlan} AND NOT ${prodCancelled} AND NOT ${shipCancelled} AND wf_i.delivered_qty = 0)`;
      break;
    case "PARTIAL": condition = sql`wf_i.delivered_qty > 0`; break;
    default: throw new Error("Filtre d’avancement invalide");
  }
  const exists = (predicate: SQL, restrict = false) => sql`EXISTS (SELECT 1 FROM order_items wf_i WHERE wf_i.order_id = ${orders.id}
    AND wf_i.quantity > 0 ${restrict ? sql`AND wf_i.id = ${orderItems.id}` : sql``} AND (${predicate}))`;
  const hasItems = exists(sql`true`);
  if (article) {
    if (state === "CANCELLED") return sql`(${exists(condition, itemScope)} OR (${cancelledOrder} AND ${exists(sql`true`, itemScope)}))`;
    return sql`(NOT ${cancelledOrder} AND ${exists(condition, itemScope)})`;
  }
  if (state === "CANCELLED") return sql`(${cancelledOrder} OR (${hasItems} AND NOT ${exists(sql`NOT (${condition})`)}))`;
  if (state === "PARTIAL") return sql`(NOT ${cancelledOrder} AND ${exists(condition)} AND ${exists(sql`wf_i.delivered_qty < wf_i.quantity`)})`;
  return sql`(NOT ${cancelledOrder} AND ${hasItems} AND NOT ${exists(sql`NOT (${condition})`)})`;
}
