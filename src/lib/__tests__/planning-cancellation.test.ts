import { describe, expect, it } from "vitest";
import { orderCancelledFromPlanning, planningCancelCauses } from "../planning-cancellation";

describe("orderCancelledFromPlanning", () => {
  it("commande annulée seulement si tous ses articles sont annulés dans le planning", () => {
    const entries = [
      { itemId: 1, status: "ANNULE" },
      { itemId: 2, status: "ANNULE" },
    ];
    expect(orderCancelledFromPlanning([1, 2], entries)).toBe(true);
  });

  it("un article encore actif empêche l'annulation de la commande", () => {
    const entries = [
      { itemId: 1, status: "ANNULE" },
      { itemId: 2, status: "EN_COURS" },
    ];
    expect(orderCancelledFromPlanning([1, 2], entries)).toBe(false);
  });

  it("un article avec une ligne active et une ligne annulée reste actif", () => {
    const entries = [
      { itemId: 1, status: "ANNULE" },
      { itemId: 1, status: "TERMINE" },
    ];
    expect(orderCancelledFromPlanning([1], entries)).toBe(false);
  });

  it("un article absent du planning n'est pas considéré comme annulé", () => {
    expect(orderCancelledFromPlanning([1, 2], [{ itemId: 1, status: "ANNULE" }])).toBe(false);
  });

  it("une commande sans article n'est jamais annulée par le planning", () => {
    expect(orderCancelledFromPlanning([], [])).toBe(false);
  });
});

describe("planningCancelCauses", () => {
  it("retient uniquement les annulations non appliquées avec motif, sans doublon", () => {
    const causes = planningCancelCauses([
      { articleName: "Vis A", status: "ANNULE", reason: "Client absent", appliedAt: null },
      { articleName: "Vis A", status: "ANNULE", reason: "Client absent", appliedAt: null },
      { articleName: "Vis B", status: "ANNULE", reason: "  ", appliedAt: null },
      { articleName: "Vis C", status: "SUSPENDU", reason: "Panne", appliedAt: null },
      { articleName: "Vis D", status: "ANNULE", reason: "Trop tard", appliedAt: "2026-10-01" },
    ]);
    expect(causes).toEqual(["Vis A : Client absent"]);
  });
});
