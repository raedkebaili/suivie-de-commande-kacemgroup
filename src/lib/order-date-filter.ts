import { and, gte, lte } from "drizzle-orm";
import { orders } from "@/db/schema";
import { validISODate } from "./order-date-filter-client";
/** Bornes inclusives sur la date de commande commerciale, partagées par les exports. */
export function parseOrderDateRange(params: URLSearchParams) {
  const from = params.get("orderFrom") || "", to = params.get("orderTo") || "";
  if ((from && !validISODate(from)) || (to && !validISODate(to)) || (from && to && from > to)) throw new Error("Période de commande invalide");
  return { from, to };
}
export function orderDateFilterSQL(range: { from: string; to: string }) {
  return and(range.from ? gte(orders.orderDate, range.from) : undefined, range.to ? lte(orders.orderDate, range.to) : undefined);
}
