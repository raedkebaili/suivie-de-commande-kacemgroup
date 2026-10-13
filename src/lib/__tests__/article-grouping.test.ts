import { describe, expect, it } from "vitest";
import { articleGroupKey, groupArticles, normalizeArticleName } from "../article-grouping";

describe("article-grouping — regroupement par famille identifiée", () => {
  it("normalise majuscules, accents, espaces", () => {
    expect(normalizeArticleName("  néo lux  ")).toContain("NEO");
    expect(normalizeArticleName("éclairé")).toContain("ECLAIRE");
  });

  it("regroupe par famille, pas par préfixe de caractères", () => {
    expect(articleGroupKey("NETLUX 150 W")).toBe("NETLUX");
    expect(articleGroupKey("NETLUX 150 W")).toBe(articleGroupKey("NETLUX 200 W"));
    expect(articleGroupKey("NETLUX 150 W")).not.toBe(articleGroupKey("NETLUXE 150 W"));
    expect(articleGroupKey("NETLUX 2.0 150 W")).not.toBe(articleGroupKey("NETLUX 150 W"));
  });

  it("les désignations non reconnues forment le groupe « À classifier »", () => {
    expect(articleGroupKey("NETLUX 2 100 W")).toBe("À classifier");
  });

  it("totalise quantités, produit, livré et reste", () => {
    const groups = groupArticles([
      { articleName: "NETLUX 150 W", quantity: 10, producedQty: 6, deliveredQty: 2 },
      { articleName: "NETLUX 200 W", quantity: 5, producedQty: 5, deliveredQty: 5 },
      { articleName: "OMEGA 10 W", quantity: 3, deliveredQty: 0 },
    ]);
    expect(groups.length).toBe(2);
    const net = groups.find(g => g.key === "NETLUX")!;
    // reste = quantité − livré (borné à 0) : (10−2) + (5−5) = 8
    expect(net.totalQuantity).toBe(15);
    expect(net.totalProduced).toBe(11);
    expect(net.totalDelivered).toBe(7);
    expect(net.totalRemaining).toBe(8);
  });
});
