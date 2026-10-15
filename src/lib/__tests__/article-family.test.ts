import { describe, expect, it } from "vitest";
import {
  ARTICLE_FAMILY_STATUS,
  UNCLASSIFIED_GROUP_KEY,
  classifyArticleDesignation,
  familyGroupKey,
  normalizeDesignation,
} from "../article-family";
import { groupArticles } from "../article-grouping";

const cls = (name: string) => classifyArticleDesignation(name);

describe("classification — exemples de validation de la demande", () => {
  it.each([
    ["NETLUX 100 W", "NETLUX", null, 100],
    ["NETLUX100 W", "NETLUX", null, 100],
    ["NETLUX 150 W", "NETLUX", null, 150],
    ["NETLUX150", "NETLUX", null, 150],
    ["NETLUX 2.0 100 W", "NETLUX", "2.0", 100],
    ["NETLUX 2.0100", "NETLUX", "2.0", 100],
    ["NETLUX 2.0 150 W", "NETLUX", "2.0", 150],
    ["NETLUX 2.0150", "NETLUX", "2.0", 150],
    ["APOLLO+ 200 W", "APOLLO+", null, 200],
    ["APOLLO+200 W", "APOLLO+", null, 200],
    ["APOLLO+ 400 W", "APOLLO+", null, 400],
    ["APOLLO+400 W", "APOLLO+", null, 400],
  ])("%s → famille %s, génération %s, puissance %s", (name, family, generation, power) => {
    const info = cls(name);
    expect(info.status).toBe(ARTICLE_FAMILY_STATUS.RECONNU);
    expect(info.family).toBe(family);
    expect(info.generation).toBe(generation);
    expect(info.power).toBe(power);
  });
});

describe("cas de test obligatoires", () => {
  it("1. NETLUX 100 W et NETLUX 150 W : même famille, puissances distinctes", () => {
    expect(familyGroupKey("NETLUX 100 W")).toBe("NETLUX");
    expect(familyGroupKey("NETLUX 150 W")).toBe("NETLUX");
    expect(cls("NETLUX 100 W").power).not.toBe(cls("NETLUX 150 W").power);
  });

  it("2. NETLUX 2.0 100 W et NETLUX 2.0 150 W : même famille NETLUX 2.0, puissances distinctes", () => {
    expect(familyGroupKey("NETLUX 2.0 100 W")).toBe("NETLUX 2.0");
    expect(familyGroupKey("NETLUX 2.0 150 W")).toBe("NETLUX 2.0");
    expect(cls("NETLUX 2.0 100 W").power).toBe(100);
    expect(cls("NETLUX 2.0 150 W").power).toBe(150);
  });

  it("3. NETLUX 100 W et NETLUX 2.0 100 W : familles différentes malgré la même puissance", () => {
    expect(familyGroupKey("NETLUX 100 W")).not.toBe(familyGroupKey("NETLUX 2.0 100 W"));
    expect(cls("NETLUX 100 W").power).toBe(cls("NETLUX 2.0 100 W").power);
  });

  it("4. APOLLO+ 200 W et APOLLO+ 400 W : même famille, puissances distinctes", () => {
    expect(familyGroupKey("APOLLO+ 200 W")).toBe("APOLLO+");
    expect(familyGroupKey("APOLLO+ 400 W")).toBe("APOLLO+");
    expect(cls("APOLLO+ 200 W").power).toBe(200);
    expect(cls("APOLLO+ 400 W").power).toBe(400);
  });

  it("5. préfixe commun, familles différentes : aucune fusion incorrecte", () => {
    expect(familyGroupKey("NETLUX 100 W")).not.toBe(familyGroupKey("NETLUXE 100 W"));
    expect(familyGroupKey("APOLLO 200 W")).not.toBe(familyGroupKey("APOLLO+ 200 W"));
    expect(familyGroupKey("NETLUX 100 W")).not.toBe(familyGroupKey("NETLUX 2.0 100 W"));
  });

  it("6. article sans puissance identifiable : classification conservée sans erreur", () => {
    const info = cls("ACCESSOIRE");
    expect(info.status).toBe(ARTICLE_FAMILY_STATUS.RECONNU);
    expect(info.family).toBe("ACCESSOIRE");
    expect(info.power).toBeNull();
    expect(cls("NETLUX 2.0").power).toBeNull();
  });

  it("7. article ambigu ou inconnu : « À classifier », sans famille attribuée", () => {
    for (const name of ["NETLUX 2 100 W", "NETLUX 2.0 LED 100 W", "Câble 2 m", "X 100 W", "", "   ", "12345"]) {
      const info = cls(name);
      expect(info.status).toBe(ARTICLE_FAMILY_STATUS.A_CLASSIFIER);
      expect(info.family).toBeNull();
      expect(familyGroupKey(name)).toBe(UNCLASSIFIED_GROUP_KEY);
    }
  });
});

describe("règles de classification", () => {
  it("normalise espaces, casse, accents et virgule décimale sans altérer la désignation", () => {
    expect(normalizeDesignation("  netlux   2,0  150 w ")).toBe("NETLUX 2.0 150 W");
    expect(cls("  netlux   2,0  150 w ").designation).toBe("  netlux   2,0  150 w ");
    expect(familyGroupKey("netlux 2,0 150 w")).toBe(familyGroupKey("NETLUX 2.0 150 W"));
  });

  it("est déterministe : même désignation, même classification", () => {
    expect(cls("NETLUX 2.0 150 W")).toEqual(cls("NETLUX 2.0 150 W"));
  });

  it("ne déduit jamais la famille de la seule puissance", () => {
    expect(familyGroupKey("NETLUX 100 W")).not.toBe(familyGroupKey("OMEGA 100 W"));
    expect(familyGroupKey("OMEGA 100 W")).toBe("OMEGA");
  });
});

describe("regroupement — quantités, sans double comptage", () => {
  it("8. un même article présent dans plusieurs commandes : lignes conservées, aucune perte", () => {
    const groups = groupArticles([
      { articleName: "NETLUX 150 W", quantity: 10, orderNumber: "CMD-1" },
      { articleName: "NETLUX 150 W", quantity: 4, orderNumber: "CMD-2" },
      { articleName: "NETLUX 100 W", quantity: 7, orderNumber: "CMD-3" },
    ]);
    expect(groups.map(g => g.key)).toEqual(["NETLUX"]);
    expect(groups[0].lines).toHaveLength(3);
    expect(groups[0].totalQuantity).toBe(21);
    expect(groups[0].variants).toEqual(["NETLUX 100 W", "NETLUX 150 W"]);
  });

  it("9. totaux identiques avant et après regroupement (NETLUX et NETLUX 2.0 séparés)", () => {
    const input = [
      { articleName: "NETLUX 100 W", quantity: 5, producedQty: 2, deliveredQty: 1 },
      { articleName: "NETLUX 2.0 100 W", quantity: 3, producedQty: 3, deliveredQty: 0 },
      { articleName: "NETLUX 2.0 150 W", quantity: 2, producedQty: 0, deliveredQty: 2 },
      { articleName: "NETLUX 2 100 W", quantity: 6, producedQty: 0, deliveredQty: 0 },
    ];
    const groups = groupArticles(input);
    const sum = (k: "quantity" | "producedQty" | "deliveredQty") => input.reduce((s, i) => s + (i[k] || 0), 0);
    expect(groups.reduce((s, g) => s + g.totalQuantity, 0)).toBe(sum("quantity"));
    expect(groups.reduce((s, g) => s + g.totalProduced, 0)).toBe(sum("producedQty"));
    expect(groups.reduce((s, g) => s + g.totalDelivered, 0)).toBe(sum("deliveredQty"));
    expect(groups.map(g => g.key)).toEqual(["NETLUX", "NETLUX 2.0", UNCLASSIFIED_GROUP_KEY]);
    expect(groups.find(g => g.key === "NETLUX 2.0")!.totalQuantity).toBe(5);
  });

  it("les articles à classifier restent séparés et sont placés en dernier", () => {
    const groups = groupArticles([
      { articleName: "ZZZ 100 W", quantity: 1 },
      { articleName: "NETLUX 2 100 W", quantity: 1 },
      { articleName: "ALPHA 100 W", quantity: 1 },
    ]);
    expect(groups.map(g => g.key)).toEqual(["ALPHA", "ZZZ", UNCLASSIFIED_GROUP_KEY]);
    expect(groups[2].variants).toEqual(["NETLUX 2 100 W"]);
  });
});
