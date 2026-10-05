import { describe, expect, it } from "vitest";
import { getOrderVisualState } from "../order-visual-state";

describe("getOrderVisualState — état visuel d'une ligne de commande", () => {
  it("annulée prime sur tout", () => {
    expect(getOrderVisualState({ productionStatus: "ANNULEE", ordered: 10, produced: 10, delivered: 10 })).toBe("cancelled");
  });

  it("livrée quand LIVREE ou quand tout est livré", () => {
    expect(getOrderVisualState({ productionStatus: "LIVREE", ordered: 10, produced: 10, delivered: 10 })).toBe("delivered");
    expect(getOrderVisualState({ productionStatus: "EN_PRODUCTION", ordered: 10, produced: 6, delivered: 10 })).toBe("delivered");
  });

  it("en attente de livraison quand entièrement produite mais pas livrée", () => {
    expect(getOrderVisualState({ productionStatus: "EN_PRODUCTION", ordered: 10, produced: 10, delivered: 4 })).toBe("awaiting-delivery");
  });

  it("neutre dans les autres cas", () => {
    expect(getOrderVisualState({ productionStatus: "EN_INSTANCE", ordered: 10, produced: 2, delivered: 0 })).toBe("neutral");
  });

  it("une commande à 0 article n'est ni livrée ni en attente", () => {
    expect(getOrderVisualState({ productionStatus: "EN_INSTANCE", ordered: 0, produced: 0, delivered: 0 })).toBe("neutral");
  });
});
