import { describe, expect, it } from "vitest";
import { canEditPlanningOnMobile, filterMobileOrders, mobilePlanningStateOptions, normalizeSearch } from "../mobile-orders";

const orders = [
  { orderNumber: "CMD-001", clientName: "Société Élec", agencyName: "Tunis", affaire: "Projet Nord", productionStatus: "EN_INSTANCE", priority: "NORMALE" },
  { orderNumber: "CMD-002", clientName: "Atlas Lum", agencyName: "Sfax", affaire: "Éclairage ville", productionStatus: "EN_PRODUCTION", priority: "1" },
  { orderNumber: "CMD-003", clientName: "Atlas Lum", agencyName: "Sfax", affaire: null, productionStatus: "LIVREE", priority: "NORMALE" },
];

describe("recherche mobile", () => {
  it("ignore la casse et les accents", () => {
    expect(normalizeSearch("ÉLEC")).toBe("elec");
    expect(filterMobileOrders(orders, { query: "elec" }).map((o) => o.orderNumber)).toEqual(["CMD-001"]);
  });
  it("recherche par mots multiples (tous doivent correspondre)", () => {
    expect(filterMobileOrders(orders, { query: "atlas sfax" }).map((o) => o.orderNumber)).toEqual(["CMD-002", "CMD-003"]);
    expect(filterMobileOrders(orders, { query: "atlas tunis" })).toEqual([]);
  });
  it("filtre par état de production et par priorité", () => {
    expect(filterMobileOrders(orders, { productionStatus: "EN_PRODUCTION" }).map((o) => o.orderNumber)).toEqual(["CMD-002"]);
    expect(filterMobileOrders(orders, { priority: "NORMALE", productionStatus: "" })).toHaveLength(2);
  });
  it("sans filtre, renvoie tout", () => {
    expect(filterMobileOrders(orders, {})).toHaveLength(3);
  });
});

describe("états proposés sur mobile", () => {
  it("responsable planification : En instance et Annulée seulement", () => {
    expect(mobilePlanningStateOptions("planification").map((s) => s.value)).toEqual(["EN_INSTANCE", "ANNULEE"]);
  });
  it("superadmin : tous les états", () => {
    expect(mobilePlanningStateOptions("superadmin")).toHaveLength(4);
  });
  it("autres rôles : pas de formulaire de planification", () => {
    expect(canEditPlanningOnMobile("commercial")).toBe(false);
    expect(canEditPlanningOnMobile("technique")).toBe(false);
    expect(canEditPlanningOnMobile("planification")).toBe(true);
  });
});
