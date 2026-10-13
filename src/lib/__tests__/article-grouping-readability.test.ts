import { describe, expect, it } from "vitest";
import { groupArticles } from "../article-grouping";
import { UNCLASSIFIED_GROUP_KEY } from "../article-family";

const items = [
  { articleName: "NETLUX 100 W", quantity: 10, producedQty: 4, deliveredQty: 2, affaire: "A1" },
  { articleName: "NETLUX 150 W", quantity: 5, producedQty: 0, deliveredQty: 5, affaire: "A2" },
  { articleName: "NETLUX 100 W", quantity: 3, producedQty: 1, deliveredQty: 0, affaire: "A3" },
  { articleName: "CABLE 2 M", quantity: 7, producedQty: 0, deliveredQty: 0, affaire: "A4" },
];

describe("regroupement — lisibilité (champs ajoutés)", () => {
  it("la répartition par puissance additionne exactement les totaux du groupe", () => {
    const [netlux] = groupArticles(items.slice(0, 3));
    expect(netlux.powerBreakdown.map(b => b.power)).toEqual([100, 150]);
    const sum = (k: "quantity" | "producedQty" | "deliveredQty" | "remaining") =>
      netlux.powerBreakdown.reduce((acc, b) => acc + b[k], 0);
    expect(sum("quantity")).toBe(netlux.totalQuantity);
    expect(sum("producedQty")).toBe(netlux.totalProduced);
    expect(sum("deliveredQty")).toBe(netlux.totalDelivered);
    expect(sum("remaining")).toBe(netlux.totalRemaining);
    expect(netlux.powerBreakdown[0].lines).toBe(2);
  });

  it("chaque ligne porte sa puissance et l'origine de sa famille", () => {
    const groups = groupArticles(items, new Map([["CABLE 2 M", "NETLUX"]]));
    const netlux = groups.find(g => g.key === "NETLUX")!;
    expect(netlux.lines.every(l => l.familySource !== null)).toBe(true);
    expect(netlux.lines.find(l => l.articleName === "CABLE 2 M")!.familySource).toBe("MANUEL");
    expect(netlux.lines.find(l => l.articleName === "NETLUX 150 W")!.familySource).toBe("AUTOMATIQUE");
    expect(netlux.lines.find(l => l.articleName === "NETLUX 150 W")!.power).toBe(150);
  });

  it("À classifier : origine nulle et puissance inconnue placée en dernier", () => {
    const groups = groupArticles([
      { articleName: "CABLE 2 M", quantity: 1 },
      { articleName: "NETLUX 100 W", quantity: 1 },
    ]);
    expect(groups[groups.length - 1].key).toBe(UNCLASSIFIED_GROUP_KEY);
    expect(groups[groups.length - 1].lines[0].familySource).toBeNull();
    expect(groups[groups.length - 1].powerBreakdown[0].power).toBeNull();
  });
});
