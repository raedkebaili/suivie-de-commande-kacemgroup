import { describe, expect, it } from "vitest";
import { canManageMobilePlanning, expeditionAvailable, mobilePlanningQuantity, planningTransitionWarning } from "../mobile-planning";
import { canOpenMobileSection } from "../mobile-navigation";
import type { Role } from "../types";

const roles: Role[] = ["superadmin", "commercial", "technique", "planification", "consultant_prod", "recouvrement", "acces_agence", "gerant"];
describe("droits des plannings mobiles", () => {
  it("restreint la gestion à superadmin et planification", () => {
    for (const role of roles) expect(canManageMobilePlanning(role)).toBe(["superadmin", "planification"].includes(role));
  });
  it("conserve les droits de consultation ordinateur", () => {
    for (const role of roles) {
      expect(canOpenMobileSection(role, "productionPlanning")).toBe(["superadmin", "planification", "consultant_prod", "gerant"].includes(role));
      expect(canOpenMobileSection(role, "expeditionPlanning")).toBe(["superadmin", "planification", "gerant"].includes(role));
      expect(canOpenMobileSection(role, "newOrder")).toBe(["superadmin", "commercial", "planification"].includes(role));
    }
  });
});
describe("quantités et confirmations de planning", () => {
  it("exige une quantité entière positive", () => {
    expect(mobilePlanningQuantity("12")).toBe(12);
    for (const value of ["", "1.5", "-1", "0", "abc", "Infinity"]) expect(() => mobilePlanningQuantity(value)).toThrow();
  });
  it("limite l’expédition au produit non livré", () => {
    expect(expeditionAvailable(20, 8)).toBe(12);
    expect(expeditionAvailable(3, 8)).toBe(0);
    expect(expeditionAvailable(null, undefined)).toBe(0);
  });
  it("prévient avant l’application des quantités réelles et l’annulation", () => {
    for (const status of ["TERMINE", "LIVRE", "ANNULE"]) expect(planningTransitionWarning(status)).toBeTruthy();
    expect(planningTransitionWarning("EN_COURS")).toBeNull();
  });
});
