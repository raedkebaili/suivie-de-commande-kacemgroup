export type PlanningListRow = {
  id: number; itemId: number; orderId: number; planDate: string; articleName: string;
  orderNumber?: string | null; clientName?: string | null; factoryName?: string | null;
  driverName?: string | null; affaire?: string | null; reason?: string | null; note?: string | null;
  status: string; plannedQty: number; appliedQty?: number; loadedQty?: number;
};
export const normalizePlanningSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function filterPlanningRows<T extends PlanningListRow>(rows: T[], query: string, status = "") {
  const words = normalizePlanningSearch(query).split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    if (status && row.status !== status) return false;
    const haystack = normalizePlanningSearch([row.articleName, row.orderNumber, row.clientName, row.factoryName,
      row.driverName, row.affaire, row.planDate, row.reason, row.note].join(" "));
    return words.every(word => haystack.includes(word));
  });
}
export function summarizePlanning(rows: PlanningListRow[]) {
  const states: Record<string, number> = {};
  for (const row of rows) states[row.status] = (states[row.status] || 0) + 1;
  return { lines: rows.length, articles: new Set(rows.map(row => row.itemId)).size,
    orders: new Set(rows.map(row => row.orderId)).size, states };
}
export const EXPEDITION_PLANNING_FILTERS = [
  { key: "NON_TRAITE", label: "En attente d’expédition" }, { key: "EN_COURS", label: "En cours de livraison" },
  { key: "LIVRE", label: "Livré" }, { key: "ANNULE", label: "Annulé" },
];
