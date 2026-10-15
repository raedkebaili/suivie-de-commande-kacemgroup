// =============================================================================
// TESTS A–H — Évolution du formulaire d'étude photométrique (§22).
// Exécution : npx vitest run src/lib/__tests__/study-rules.test.ts
// =============================================================================
import { describe, expect, it } from "vitest";
import {
  filterArticlesByOrder,
  sanitizeItemsOnOrderChange,
  searchArticles,
  searchLenses,
  searchOrders,
  type ArticleOption,
} from "../study-search";
import { articleLensToValue, LENS_OVERRIDE_MESSAGE, latestStudyItemForOrderItem, resolveStudyLens } from "../study-lens";

// ── Jeu d'essai : commande 125/2026 (cf. §3) ─────────────────────────────
const ORDER_125 = { id: 125, orderNumber: "125/2026", affaire: "Éclairage stade", clientName: "Ville de Tunis" };
const ORDER_126 = { id: 126, orderNumber: "126/2026", affaire: "Parking Nord", clientName: "Société ABC" };

const ARTICLES: ArticleOption[] = [
  { id: 1, orderId: 125, reference: "NLX100", articleName: "NETLUX 100 W", quantity: 10, lens: null },
  { id: 2, orderId: 125, reference: "NLX150", articleName: "NETLUX 150 W", quantity: 6, lens: "LENS-A" },
  { id: 3, orderId: 125, reference: "APL400", articleName: "APOLLO 400 W", quantity: 4, lens: null },
  { id: 4, orderId: 126, reference: "NLX200", articleName: "NETLUX 200 W", quantity: 8, lens: null },
  { id: 5, orderId: 126, reference: "PLX60", articleName: "POLLUX 60 W", quantity: 12, lens: null },
];

const LENSES = [
  { id: 11, reference: "LENS-A", name: "Lentille standard 90°", specs: null },
  { id: 12, reference: "LENS-B", name: "Lentille intensive 60°", specs: null },
  { id: 13, reference: "LENS-C", name: "Lentille extensive 120°", specs: null },
];

// ── TEST A — commande → articles (§3 : UNIQUEMENT ceux de la commande) ───
describe("TEST A — filtrage strict article ∈ commande", () => {
  it("125/2026 propose exactement NETLUX 100/150 W + APOLLO 400 W", () => {
    const names = filterArticlesByOrder(ARTICLES, 125).map((a) => a.articleName);
    expect(names).toEqual(["NETLUX 100 W", "NETLUX 150 W", "APOLLO 400 W"]);
  });
  it("n'expose jamais les articles d'une autre commande (126)", () => {
    const ids = filterArticlesByOrder(ARTICLES, 125).map((a) => a.id);
    expect(ids).not.toContain(4);
    expect(ids).not.toContain(5);
  });
  it("sans commande : liste vide (jamais le catalogue général)", () => {
    expect(filterArticlesByOrder(ARTICLES, null)).toEqual([]);
  });
});

// ── TEST B — changement de commande (§5) ─────────────────────────────────
describe("TEST B — changement de commande invalide l'article devenu hors périmètre", () => {
  it("Commande A + article A → passage en B ⇒ article A invalidé", () => {
    const items = [{ orderItemId: 2 as number | null, lensId: 12 as number | null }];
    const next = sanitizeItemsOnOrderChange(items, filterArticlesByOrder(ARTICLES, 126));
    expect(next[0].orderItemId).toBeNull();
  });
  it("article commun conservé (aucune invalidation abusive)", () => {
    const items = [{ orderItemId: 1 as number | null }];
    const next = sanitizeItemsOnOrderChange(items, filterArticlesByOrder(ARTICLES, 125));
    expect(next[0].orderItemId).toBe(1);
  });
  it("jamais de combinaison Commande B + article de Commande A", () => {
    const items = [{ orderItemId: 4 as number | null }];
    const next = sanitizeItemsOnOrderChange(items, filterArticlesByOrder(ARTICLES, 125));
    expect(next[0].orderItemId).toBeNull();
  });
});

// ── TEST C — recherche intelligente (§6-§8) ───────────────────────────────
describe("TEST C — recherche par nom, référence, partiel, casse", () => {
  const list125 = filterArticlesByOrder(ARTICLES, 125);
  it("'net' propose NETLUX 100 W + NETLUX 150 W", () => {
    expect(searchArticles(list125, "net").map((a) => a.articleName)).toEqual(["NETLUX 100 W", "NETLUX 150 W"]);
  });
  it("'apollo' (minuscules) retrouve APOLLO 400 W", () => {
    expect(searchArticles(list125, "apollo").map((a) => a.articleName)).toEqual(["APOLLO 400 W"]);
  });
  it("'NLX100' (référence) retrouve l'article", () => {
    expect(searchArticles(list125, "NLX100").map((a) => a.articleName)).toEqual(["NETLUX 100 W"]);
  });
  it("contenu partiel '150' retrouve NETLUX 150 W", () => {
    expect(searchArticles(list125, "150").map((a) => a.articleName)).toEqual(["NETLUX 150 W"]);
  });
  it("commandes : '125' / 'stade' / 'tunis' retrouvent 125/2026", () => {
    expect(searchOrders([ORDER_125, ORDER_126], "125").map((o) => o.id)).toEqual([125]);
    expect(searchOrders([ORDER_125, ORDER_126], "stade").map((o) => o.id)).toEqual([125]);
    expect(searchOrders([ORDER_125, ORDER_126], "TUNIS").map((o) => o.id)).toEqual([125]);
  });
  it("lentilles : 'lens-b' / 'intensive' retrouvent LENS-B", () => {
    expect(searchLenses(LENSES, "lens-b").map((l) => l.reference)).toEqual(["LENS-B"]);
    expect(searchLenses(LENSES, "intensive").map((l) => l.reference)).toEqual(["LENS-B"]);
  });
});

// ── TEST D — lentille existante, étude sans lentille (§15 cas 1) ──────────
describe("TEST D — article LENS-A, étude sans lentille → LENS-A (défaut)", () => {
  it("retourne la spec article avec source 'article'", () => {
    const r = resolveStudyLens(articleLensToValue("LENS-A"), null);
    expect(r.effective?.reference).toBe("LENS-A");
    expect(r.source).toBe("article");
    expect(r.overridden).toBe(false);
  });
});

// ── TEST E — override (§15 cas 2 + message §13) ───────────────────────────
describe("TEST E — article LENS-A, étude LENS-B → LENS-B + message", () => {
  it("la lentille d'étude s'impose (priorité absolue)", () => {
    const r = resolveStudyLens(articleLensToValue("LENS-A"), { reference: "LENS-B", label: "Lentille intensive 60°" });
    expect(r.effective?.reference).toBe("LENS-B");
    expect(r.source).toBe("study");
    expect(r.overridden).toBe(true);
  });
  it("le message de superposition est défini", () => {
    expect(LENS_OVERRIDE_MESSAGE).toContain("se superpose à la spécification existante");
    expect(LENS_OVERRIDE_MESSAGE).toContain("obligatoirement");
  });
});

// ── TEST F — protection contre écrasement (§14, §17) ──────────────────────
describe("TEST F — l'étude garde LENS-B malgré relecture de l'article", () => {
  it("re-résolution après rechargement article ⇒ toujours LENS-B", () => {
    const studyLens = { reference: "LENS-B", label: "Lentille intensive 60°" };
    const r = resolveStudyLens(articleLensToValue("LENS-A"), studyLens);
    expect(r.effective?.reference).toBe("LENS-B");
    expect(r.source).toBe("study");
  });
  it("cas 3 : article sans lentille + étude LENS-C ⇒ LENS-C", () => {
    const r = resolveStudyLens(articleLensToValue(null), { reference: "LENS-C", label: "Lentille extensive 120°" });
    expect(r.effective?.reference).toBe("LENS-C");
    expect(r.source).toBe("study");
  });
});

// ── TEST G — plusieurs études, aucune contamination (§12) ─────────────────
describe("TEST G — Étude1 LENS-B, Étude2 LENS-C, article LENS-A", () => {
  const article = articleLensToValue("LENS-A");
  it("Étude 1 → LENS-B", () => {
    expect(resolveStudyLens(article, { reference: "LENS-B", label: "x" }).effective?.reference).toBe("LENS-B");
  });
  it("Étude 2 → LENS-C", () => {
    expect(resolveStudyLens(article, { reference: "LENS-C", label: "x" }).effective?.reference).toBe("LENS-C");
  });
  it("article inchangé → LENS-A (fiche générale intacte)", () => {
    expect(article?.reference).toBe("LENS-A");
  });
});

// ── TEST H — suppression explicite de l'override (§19) ────────────────────
describe("TEST H — suppression lentille étude ⇒ retour LENS-A (article intact)", () => {
  it("override supprimé ⇒ fallback article", () => {
    const before = resolveStudyLens(articleLensToValue("LENS-A"), { reference: "LENS-B", label: "x" });
    expect(before.effective?.reference).toBe("LENS-B");
    const after = resolveStudyLens(articleLensToValue("LENS-A"), null);
    expect(after.effective?.reference).toBe("LENS-A");
    expect(after.source).toBe("article");
  });
  it("la spec générale de l'article n'est jamais supprimée", () => {
    expect(articleLensToValue("LENS-A")).not.toBeNull();
  });
});

// ── TEST I — une étude récente sans lentille neutralise l'ancienne ────────
describe("TEST I — priorité à la dernière modification d'étude", () => {
  it("retourne la ligne récente même lorsque lensId est null", () => {
    const recent: { orderItemId: number; lensId: string | null; lensReference?: string | null } = { orderItemId: 2, lensId: null, lensReference: null };
    const old: { orderItemId: number; lensId: string | null; lensReference?: string | null } = { orderItemId: 2, lensId: "12", lensReference: "LENS-B" };
    expect(latestStudyItemForOrderItem([{ items: [recent] }, { items: [old] }], 2)).toBe(recent);
  });

  it("ne mélange pas les articles de deux études", () => {
    const first = { orderItemId: 1, lensId: "11" };
    const second = { orderItemId: 2, lensId: "12" };
    expect(latestStudyItemForOrderItem([{ items: [first, second] }], 2)).toBe(second);
    expect(latestStudyItemForOrderItem([{ items: [first, second] }], 99)).toBeNull();
  });
});
