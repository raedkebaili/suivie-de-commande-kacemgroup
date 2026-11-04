import { and, or, sql, type SQL } from "drizzle-orm";
import { todayISO } from "./production-planning-constants";
import { orders, orderItems } from "@/db/schema";
import { isWorkflowFilter } from "./workflow-filters";

/** Un seul prédicat pour commandes, exports et regroupements. Aucun changement de cumul. */
export function workflowFilterSQL(key: string | null, itemScope = false): SQL | undefined {
  if (!key) return undefined;
  if (!isWorkflowFilter(key)) throw new Error("Filtre d’avancement invalide");
  const item = itemScope ? sql`AND wf_i.id = ${orderItems.id}` : sql``;
  const prodItem = itemScope ? sql`AND wf_p.item_id = ${orderItems.id}` : sql``;
  const expItem = itemScope ? sql`AND wf_e.item_id = ${orderItems.id}` : sql``;
  const cancelled = sql`(${orders.productionStatus} = 'ANNULEE' OR ${orders.status} = 'ANNULEE')`;
  const hasItems = sql`EXISTS (SELECT 1 FROM order_items wf_i WHERE wf_i.order_id = ${orders.id} ${item} AND wf_i.quantity > 0)`;
  const delivered = sql`(${orders.productionStatus} = 'LIVREE' OR (${hasItems} AND NOT EXISTS (
    SELECT 1 FROM order_items wf_i WHERE wf_i.order_id = ${orders.id} ${item} AND wf_i.quantity > 0 AND wf_i.delivered_qty < wf_i.quantity)))`;
  const produced = sql`(${hasItems} AND NOT EXISTS (SELECT 1 FROM order_items wf_i
    WHERE wf_i.order_id = ${orders.id} ${item} AND wf_i.quantity > 0 AND wf_i.produced_qty < wf_i.quantity))`;
  const production = (statuses: string[]) => sql`EXISTS (SELECT 1 FROM production_plan_entries wf_p
    WHERE wf_p.order_id = ${orders.id} ${prodItem} AND wf_p.status IN (${sql.join(statuses.map(status => sql`${status}`), sql`, `)}))`;
  const expedition = (statuses: string[]) => sql`EXISTS (SELECT 1 FROM expedition_plan_entries wf_e
    WHERE wf_e.order_id = ${orders.id} ${expItem} AND wf_e.status IN (${sql.join(statuses.map(status => sql`${status}`), sql`, `)}))`;
  const today = todayISO();
  const activeProduction = sql`EXISTS (SELECT 1 FROM production_plan_entries wf_p
    WHERE wf_p.order_id = ${orders.id} ${prodItem} AND wf_p.status = 'EN_COURS' AND wf_p.plan_date <= ${today})`;
  const futureProduction = sql`EXISTS (SELECT 1 FROM production_plan_entries wf_p
    WHERE wf_p.order_id = ${orders.id} ${prodItem} AND wf_p.status = 'EN_COURS' AND wf_p.plan_date > ${today})`;
  const partialDelivery = sql`EXISTS (SELECT 1 FROM order_items wf_i WHERE wf_i.order_id = ${orders.id} ${item} AND wf_i.delivered_qty > 0)`;
  const shipping = or(expedition(["EN_COURS"]), partialDelivery)!;
  const open = sql`NOT ${cancelled} AND NOT ${delivered}`;
  if (key === "CANCELLED") return cancelled;
  if (key === "DELIVERED") return and(sql`NOT ${cancelled}`, delivered);
  if (key === "READY") return and(open, produced, sql`NOT (${shipping})`);
  if (key === "DELIVERY") return and(open, shipping);
  if (key === "UNPLANNED") return and(open, sql`NOT (${production(["EN_ATTENTE", "EN_COURS", "SUSPENDU"])})`, sql`NOT (${expedition(["NON_TRAITE", "PLANIFIE", "EN_COURS"])})`);
  if (key === "production:EN_COURS") {
    const progress = sql`EXISTS (SELECT 1 FROM order_items wf_i WHERE wf_i.order_id = ${orders.id} ${item} AND wf_i.produced_qty > 0)`;
    return and(open, sql`NOT (${produced})`, or(activeProduction, and(progress, sql`NOT (${production(["SUSPENDU"])})`)));
  }
  if (key.startsWith("production:")) {
    const status = key.slice(11);
    if (status === "TERMINE") return and(sql`NOT ${cancelled}`, or(production([status]), produced));
    if (status === "ANNULE") return production([status]);
    if (status === "EN_ATTENTE") return and(open, sql`NOT (${produced})`, or(production([status]), futureProduction));
    return and(open, sql`NOT (${produced})`, production([status]));
  }
  const status = key.slice(11);
  const states = status === "NON_TRAITE" ? ["NON_TRAITE", "PLANIFIE"] : status === "LIVRE" ? ["LIVRE", "TERMINE"] : [status];
  return ["ANNULE", "LIVRE"].includes(status) ? expedition(states) : and(open, expedition(states));
}
