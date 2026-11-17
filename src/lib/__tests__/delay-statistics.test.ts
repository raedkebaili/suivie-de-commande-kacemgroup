import { expect, it } from "vitest";
import { buildDelayReport, parseDelayTarget, type DelayItem } from "../delay-statistics";
import { calendarRange, validISODate } from "../order-date-filter-client";
import { parseOrderDateRange } from "../order-date-filter";
const item = (extra: Partial<DelayItem> = {}): DelayItem => ({ orderId: 1, orderDate: "2026-01-01", factory: "Usine A", quantity: 10, producedQty: 10, deliveredQty: 10, productionCompletedOn: "2026-01-11", expeditionCompletedOn: "2026-01-21", ...extra });
it("ne choisit aucun seuil arbitraire et n’assimile pas les données inconnues à un taux nul", () => {
  const report = buildDelayReport([item()], null, null, "2026-02-01");
  expect(report.total.production.rate).toBeNull();
  expect(report.total.expedition.rate).toBeNull();
  expect(report.total.production.averageDays).toBe(10);
  expect(report.total.expedition.averageDays).toBe(20);
});
it("calcule des taux sur des commandes distinctes, pas sur les articles ni la moyenne des taux", () => {
  const report = buildDelayReport([item(), item({ factory: "Usine B" }), item({ orderId: 2, productionCompletedOn: "2026-01-03", expeditionCompletedOn: "2026-01-05" })], 5, 10, "2026-02-01");
  expect(report.total.orders).toBe(2);
  expect(report.total.production.rate).toBe(50);
  expect(report.total.expedition.rate).toBe(50);
  expect(report.factories.find(row => row.factory === "Usine B")?.production.rate).toBe(100);
});
it("prend la dernière date de tous les articles de la commande, y compris en mode usine", () => {
  const report = buildDelayReport([item(), item({ factory: "Usine B", expeditionCompletedOn: "2026-01-30" })], 5, 25, "2026-02-01");
  expect(report.factories[0].expedition.averageDays).toBe(29);
  expect(report.factories[0].expedition.rate).toBe(100);
});
it("compte séparément les ouvertes hors délai et exclut les fins historiques inconnues", () => {
  const report = buildDelayReport([item(), item({ orderId: 2, producedQty: 0, deliveredQty: 0, productionCompletedOn: null, expeditionCompletedOn: null }), item({ orderId: 3, productionCompletedOn: null, expeditionCompletedOn: null })], 10, 20, "2026-02-01");
  expect(report.total.production).toMatchObject({ completed: 1, late: 0, rate: 0, openLate: 1, unknown: 1 });
});
it("ne compte ni les dates incohérentes ni les dates futures comme des commandes à l’heure", () => {
  const report = buildDelayReport([item({ orderDate: "2027-01-01" }), item({ orderId: 2, expeditionCompletedOn: "2025-12-31" })], 10, 20, "2026-02-01");
  expect(report.total.expedition.completed).toBe(0);
  expect(report.total.expedition.unknown).toBe(2);
  expect(report.total.expedition.rate).toBeNull();
});
it("valide les seuils et autorise explicitement zéro jour", () => {
  expect(parseDelayTarget(null)).toBeNull(); expect(parseDelayTarget("0")).toBe(0);
  for (const bad of ["-1", "1.5", "abc", "999999", "Infinity"]) expect(() => parseDelayTarget(bad)).toThrow();
});
it("gère années et mois bissextiles et les bornes inclusives", () => {
  expect(calendarRange("year", "2026", "01", "", "")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  expect(calendarRange("month", "2024", "02", "", "")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  expect(calendarRange("month", "2025", "02", "", "").to).toBe("2025-02-28");
  expect(validISODate("2026-02-31")).toBe(false);
  expect(() => parseOrderDateRange(new URLSearchParams("orderFrom=2026-03-01&orderTo=2026-02-01"))).toThrow();
});
