import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PREDEFINED_ARTICLE_FAMILY_CATALOG,
  catalogLabel,
  cleanCatalogText,
  hasDuplicateLabel,
  validateCatalogEntry,
} from "../article-family-catalog";
import { resolveDesignationFamily, UNCLASSIFIED_GROUP_KEY, ARTICLE_FAMILY_STATUS } from "../article-family";
import { groupArticles } from "../article-grouping";

describe("catalogue prédéfini", () => {
  it("contient la liste fournie par l'administration (21 lignes)", () => {
    expect(PREDEFINED_ARTICLE_FAMILY_CATALOG).toHaveLength(21);
  });

  it("produit des libellés de regroupement corrects", () => {
    expect(catalogLabel({ subFamily: "NETLUX", variant: "" })).toBe("NETLUX");
    expect(catalogLabel({ subFamily: "NETLUX", variant: "2.0" })).toBe("NETLUX 2.0");
    expect(catalogLabel({ subFamily: "APOLO", variant: "+" })).toBe("APOLO+");
    expect(catalogLabel({ subFamily: "EUROARENA", variant: "PRO" })).toBe("EUROARENA PRO");
    expect(catalogLabel({ subFamily: "POTEAU", variant: "4m" })).toBe("POTEAU 4m");
  });

  it("aucun libellé de regroupement n'est en double (sinon deux familles fusionneraient)", () => {
    const labels = PREDEFINED_ARTICLE_FAMILY_CATALOG.map((e) => catalogLabel(e).toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("la migration 0005 contient exactement chaque ligne prédéfinie (même orthographe)", () => {
    const sql = readFileSync(join(process.cwd(), "drizzle/0005_article_family_catalog.sql"), "utf8").replace(/(\w)''(\w)/g, "$1'$2");
    for (const e of PREDEFINED_ARTICLE_FAMILY_CATALOG) {
      expect(sql).toContain(`('${e.category}', '${e.subFamily}', '${e.variant}')`);
    }
  });
});

describe("validation d'une saisie du catalogue", () => {
  it("accepte une famille avec ou sans variante, en nettoyant les espaces", () => {
    expect(validateCatalogEntry({ category: "  PROJECTEUR   LED ", subFamily: "ASTRO", variant: "" }))
      .toEqual({ ok: true, value: { category: "PROJECTEUR LED", subFamily: "ASTRO", variant: "" } });
  });

  it("refuse une famille ou une sous-famille vide", () => {
    expect(validateCatalogEntry({ category: "", subFamily: "NETLUX" }).ok).toBe(false);
    expect(validateCatalogEntry({ category: "PROJECTEUR LED", subFamily: "   " }).ok).toBe(false);
    expect(validateCatalogEntry(null).ok).toBe(false);
  });

  it("refuse les libellés trop longs", () => {
    expect(validateCatalogEntry({ category: "A".repeat(121), subFamily: "X" }).ok).toBe(false);
    expect(validateCatalogEntry({ category: "A", subFamily: "X", variant: "V".repeat(41) }).ok).toBe(false);
  });

  it("nettoie les textes", () => {
    expect(cleanCatalogText("  a   b  ")).toBe("a b");
    expect(cleanCatalogText(undefined)).toBe("");
  });

  it("détecte un doublon de libellé insensible à la casse", () => {
    const existing = [{ category: "LUMINAIRE D'ECLAIRAGE PUBLIQUE", subFamily: "NETLUX", variant: "" }];
    expect(hasDuplicateLabel({ category: "AUTRE", subFamily: "netlux", variant: "" }, existing)).toBe(true);
    // « NETLUX 2.0 » est un libellé distinct de « NETLUX »
    expect(hasDuplicateLabel({ category: "AUTRE", subFamily: "NETLUX", variant: "2.0" }, existing)).toBe(false);
  });
});

describe("priorité : affectation manuelle > classification automatique", () => {
  it("une désignation non reconnue reçoit la famille manuelle, marquée MANUEL", () => {
    expect(resolveDesignationFamily("NETLUX 2 100 W", "NETLUX 2.0")).toEqual({
      status: ARTICLE_FAMILY_STATUS.RECONNU, familyKey: "NETLUX 2.0", source: "MANUEL",
    });
  });

  it("une désignation reconnue automatiquement peut être réaffectée manuellement", () => {
    expect(resolveDesignationFamily("NETLUX 100 W", "NETLUX 2.0").familyKey).toBe("NETLUX 2.0");
  });

  it("sans affectation, la classification automatique s'applique, et « À classifier » reste non attribué", () => {
    expect(resolveDesignationFamily("NETLUX 100 W", null).source).toBe("AUTOMATIQUE");
    expect(resolveDesignationFamily("NETLUX 2 100 W", null)).toEqual({
      status: ARTICLE_FAMILY_STATUS.A_CLASSIFIER, familyKey: null, source: null,
    });
  });
});

describe("regroupement avec affectations manuelles — aucune perte ni double comptage", () => {
  it("les lignes affectées rejoignent leur famille sans changer les totaux", () => {
    const input = [
      { articleName: "NETLUX 2 100 W", quantity: 4, producedQty: 1, deliveredQty: 0 },
      { articleName: "NETLUX 2.0 150 W", quantity: 6, producedQty: 0, deliveredQty: 2 },
      { articleName: "NETLUX 2 100 W", quantity: 5, producedQty: 0, deliveredQty: 0, orderNumber: "CMD-2" },
      { articleName: "CABLE 2 M", quantity: 3, producedQty: 0, deliveredQty: 0 },
    ];
    const groups = groupArticles(input, new Map([["NETLUX 2 100 W", "NETLUX 2.0"]]));
    const sum = (k: "quantity" | "producedQty" | "deliveredQty") => input.reduce((s, i) => s + (i[k] || 0), 0);
    expect(groups.reduce((s, g) => s + g.totalQuantity, 0)).toBe(sum("quantity"));
    expect(groups.reduce((s, g) => s + g.totalProduced, 0)).toBe(sum("producedQty"));
    expect(groups.reduce((s, g) => s + g.totalDelivered, 0)).toBe(sum("deliveredQty"));

    const netlux2 = groups.find((g) => g.key === "NETLUX 2.0")!;
    expect(netlux2.lines).toHaveLength(3);          // 2 affectées + 1 automatique
    expect(netlux2.totalQuantity).toBe(15);
    expect(groups.find((g) => g.key === UNCLASSIFIED_GROUP_KEY)!.totalQuantity).toBe(3);
  });

  it("sans affectation, le regroupement est identique à l'automatique", () => {
    const input = [{ articleName: "NETLUX 100 W", quantity: 1 }, { articleName: "NETLUX 2.0 100 W", quantity: 2 }];
    expect(groupArticles(input).map((g) => g.key)).toEqual(groupArticles(input, new Map()).map((g) => g.key));
  });
});
