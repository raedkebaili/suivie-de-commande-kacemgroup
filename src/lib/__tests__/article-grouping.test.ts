import { describe, expect, it } from "vitest";
import { articleGroupKey, groupArticles, normalizeArticleName } from "../article-grouping";

describe("article-grouping — règle des 4 premiers caractères normalisés", () => {
  it("normalise majuscules, accents, espaces", () => {
    expect(normalizeArticleName("  néo lux  ")).toContain("NEO");
    expect(normalizeArticleName("éclairé")).toContain("ECLAIRE");
  });

  it("regroupe par clé de 4 caractères", () => {
    expect(articleGroupKey("NETLUX 150 W")).toBe("NETL");
    expect(articleGroupKey("NETLUX 150 W")).toBe(articleGroupKey("NETLUX 200 W"));
    expect(articleGroupKey("NETLUX 150 W")).not.toBe(articleGroupKey("OMEGA 10 W"));
  });

  it("les noms courts forment un groupe sur leur nom complet", () => {
    expect(articleGroupKey("AB")).toBeTruthy();
    expect(articleGroupKey("AB")).not.toBe(articleGroupKey("ABC"));
    expect(articleGroupKey("ABCD")).toBe("ABCD");
  });

  it("totalise quantités, produit, livré et reste", () => {
    const groups = groupArticles([
      { articleName: "NETLUX 150 W", quantity: 10, producedQty: 6, deliveredQty: 2 },
      { articleName: "NETLUX 200 W", quantity: 5, producedQty: 5, deliveredQty: 5 },
      { articleName: "OMEGA 10 W", quantity: 3, deliveredQty: 0 },
    ]);
    expect(groups.length).toBe(2);
    const net = groups.find(g => g.key === articleGroupKey("NETLUX 150 W"))!;
    // reste = quantité − livré (borné à 0) : (10−2) + (5−5) = 8
    expect(net.totalQuantity).toBe(15);
    expect(net.totalProduced).toBe(11);
    expect(net.totalDelivered).toBe(7);
    expect(net.totalRemaining).toBe(8);
  });
});
