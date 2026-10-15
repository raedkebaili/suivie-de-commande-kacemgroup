import { describe, expect, it } from "vitest";
import { commercialItemsPayload } from "../mobile-commercial";

describe("saisie commerciale mobile", () => {
  it("préserve les champs commerciaux et de planification existants sans transmettre les champs techniques", () => {
    const item = { id: 7, articleName: " Article ", quantity: 10, producedQty: 4, deliveredQty: 2, pcb: "Secret technique", productionUnit: "Usine A", plannedLoadingDate: "2026-10-20", unitPrice: "12.500", description: "Description", note: "Note", clientSpec: "Besoin", isTelegestion: true };
    const [payload] = commercialItemsPayload([item]);
    expect(payload).toEqual({ id: 7, articleName: "Article", quantity: 10, productionUnit: "Usine A", plannedLoadingDate: "2026-10-20", unitPrice: "12.500", description: "Description", note: "Note", clientSpec: "Besoin", isTelegestion: true });
    expect(payload).not.toHaveProperty("pcb");
    expect(item.articleName).toBe(" Article ");
  });
  it("refuse une liste vide et les articles invalides", () => {
    expect(() => commercialItemsPayload([])).toThrow();
    for (const quantity of [0, -1, NaN, 1.5, Infinity]) expect(() => commercialItemsPayload([{ articleName: "A", quantity }])).toThrow();
    expect(() => commercialItemsPayload([{ articleName: " ", quantity: 1 }])).toThrow();
  });
  it("refuse de descendre sous les cumuls réels", () => {
    expect(() => commercialItemsPayload([{ articleName: "A", quantity: 4, producedQty: 5 }])).toThrow();
    expect(() => commercialItemsPayload([{ articleName: "A", quantity: 4, deliveredQty: 5 }])).toThrow();
  });
});
