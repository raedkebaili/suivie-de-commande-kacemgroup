import { describe, expect, it } from "vitest";
import { isForbiddenDirectState, planningStateRedirect } from "../order-state-redirect";

describe("planification : états soldés dans les plannings", () => {
  it("En production depuis le formulaire → Planning production", () => {
    const r = planningStateRedirect("planification", "EN_INSTANCE", "EN_PRODUCTION");
    expect(r?.tab).toBe("planning");
    expect(isForbiddenDirectState("planification", "EN_INSTANCE", "EN_PRODUCTION")).toBe(true);
  });

  it("Livrée depuis le formulaire → Planning d'expédition", () => {
    const r = planningStateRedirect("planification", "EN_PRODUCTION", "LIVREE");
    expect(r?.tab).toBe("expeditionPlanning");
  });

  it("En instance et Annulée restent autorisés depuis le formulaire", () => {
    expect(planningStateRedirect("planification", "EN_PRODUCTION", "EN_INSTANCE")).toBeNull();
    expect(planningStateRedirect("planification", "EN_INSTANCE", "ANNULEE")).toBeNull();
  });

  it("aucune redirection si l'état ne change pas", () => {
    expect(planningStateRedirect("planification", "EN_PRODUCTION", "EN_PRODUCTION")).toBeNull();
    expect(planningStateRedirect("planification", "LIVREE", "LIVREE")).toBeNull();
  });

  it("la règle ne concerne que le rôle planification", () => {
    expect(planningStateRedirect("commercial", "EN_INSTANCE", "EN_PRODUCTION")).toBeNull();
    expect(planningStateRedirect("technique", "EN_INSTANCE", "LIVREE")).toBeNull();
  });
});
