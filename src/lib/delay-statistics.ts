import { validISODate } from "./order-date-filter-client";
export type DelayItem = {
  orderId: number; orderDate: string; factory: string | null; quantity: number; producedQty: number; deliveredQty: number;
  productionCompletedOn: string | null; expeditionCompletedOn: string | null;
};
export type DelayMetric = { completed: number; late: number; rate: number | null; averageDays: number | null; openLate: number; unknown: number };
export type DelayGroup = { factory: string; orders: number; production: DelayMetric; expedition: DelayMetric };
const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
export function parseDelayTarget(value: string | null): number | null {
  if (!value) return null;
  if (!/^\d{1,5}$/.test(value) || Number(value) > 36500) throw new Error("Délai cible invalide (0 à 36500 jours)");
  return Number(value);
}
export function buildDelayReport(items: DelayItem[], productionTarget: number | null, expeditionTarget: number | null, today: string) {
  const grouped = new Map<number, DelayItem[]>();
  for (const item of items.filter(item => item.quantity > 0)) {
    const rows = grouped.get(item.orderId) || []; rows.push(item); grouped.set(item.orderId, rows);
  }
  const commands = [...grouped.values()];
  const summarize = (factory: string, rows: DelayItem[][]): DelayGroup => {
    const metric = (stage: "production" | "expedition", target: number | null): DelayMetric => {
      const result: DelayMetric = { completed: 0, late: 0, rate: null, averageDays: null, openLate: 0, unknown: 0 };
      let sum = 0;
      for (const articles of rows) {
        const start = articles[0].orderDate;
        if (!validISODate(start) || start > today) { result.unknown++; continue; }
        const complete = articles.every(item => (stage === "production" ? item.producedQty : item.deliveredQty) >= item.quantity);
        if (!complete) { if (target !== null && daysBetween(start, today) > target) result.openLate++; continue; }
        const dates = articles.map(item => stage === "production" ? item.productionCompletedOn : item.expeditionCompletedOn);
        if (dates.some(date => !date || !validISODate(date))) { result.unknown++; continue; }
        const end = (dates as string[]).reduce((a, b) => a > b ? a : b);
        if (end < start || end > today) { result.unknown++; continue; }
        const duration = daysBetween(start, end);
        result.completed++; sum += duration;
        if (target !== null && duration > target) result.late++;
      }
      if (result.completed) { result.averageDays = Math.round(sum / result.completed * 10) / 10; if (target !== null) result.rate = Math.round(result.late / result.completed * 1000) / 10; }
      return result;
    };
    return { factory, orders: rows.length, production: metric("production", productionTarget), expedition: metric("expedition", expeditionTarget) };
  };
  const factories = [...new Set(commands.flatMap(rows => rows.map(item => item.factory?.trim() || "Non affectée")))].sort();
  return { total: summarize("Total", commands), factories: factories.map(factory => summarize(factory, commands.filter(rows => rows.some(item => (item.factory?.trim() || "Non affectée") === factory)))) };
}
