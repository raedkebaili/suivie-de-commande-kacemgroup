// =============================================================================
// Études photométriques — recherche intelligente + filtrage strict.
// Module PUR (aucun import "@/db") : mêmes fonctions côté API et formulaire
// (OrdersView), couvert par les tests A–H (TEST A→C).
//
// Principes (§6-§9) : liste CONTRÔLÉE + recherche (jamais de texte libre pour
// les champs liés) ; insensible casse/accents ; début OU contenu partiel.
// =============================================================================

export type OrderOption = { id: number; orderNumber: string; affaire: string | null; clientName: string | null };
export type ArticleOption = {
  id: number; orderId: number; reference: string | null; articleName: string;
  quantity: number; lens: string | null; lensBy?: string | null; lensAt?: string | null;
};
export type LensOption = { id: number; reference: string; name: string; specs: string | null };

/** Normalisation : minuscules + sans accents + espaces resserrés. */
export function norm(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Score de pertinence : 2 = commence par, 1 = contient, 0 = aucun. */
function matchScore(haystack: string, needle: string): number {
  if (!needle) return 1;
  const h = norm(haystack);
  const n = norm(needle);
  if (!n) return 1;
  if (h.startsWith(n)) return 2;
  if (h.includes(n)) return 1;
  // Recherche multi-mots : tous les mots doivent être présents.
  const words = n.split(" ").filter(Boolean);
  if (words.length > 1 && words.every((w) => h.includes(w))) return 1;
  return 0;
}

function rank<T>(items: T[], query: string, keys: (keyof T)[]): T[] {
  if (!norm(query)) return items;
  return items
    .map((item) => {
      let best = 0;
      for (const k of keys) {
        const v = item[k];
        if (typeof v === "string") best = Math.max(best, matchScore(v, query));
      }
      return { item, best };
    })
    .filter((r) => r.best > 0)
    .sort((a, b) => b.best - a.best)
    .map((r) => r.item);
}

// ── RÈGLE MAJEURE §3 : articles ∈ commande (filtrage strict, TEST A) ─────
export function filterArticlesByOrder(articles: ArticleOption[], orderId: number | null): ArticleOption[] {
  if (orderId === null || orderId === undefined) return [];
  return articles.filter((a) => a.orderId === orderId);
}

// ── §5 : changement de commande ⇒ invalider les lignes hors périmètre (TEST B)
export function sanitizeItemsOnOrderChange<T extends { orderItemId: number | null }>(
  items: T[],
  newOrderArticles: ArticleOption[]
): T[] {
  const allowed = new Set(newOrderArticles.map((a) => a.id));
  return items.map((it) => (it.orderItemId !== null && !allowed.has(it.orderItemId) ? { ...it, orderItemId: null } : it));
}

// ── Recherches intelligentes (TEST C) ────────────────────────────────────
export function searchOrders(orders: OrderOption[], query: string): OrderOption[] {
  return rank(orders, query, ["orderNumber", "affaire", "clientName"] as (keyof OrderOption)[]);
}

export function searchArticles(articles: ArticleOption[], query: string): ArticleOption[] {
  return rank(articles, query, ["articleName", "reference"] as (keyof ArticleOption)[]);
}

export function searchLenses(lenses: LensOption[], query: string): LensOption[] {
  return rank(lenses, query, ["reference", "name", "specs"] as (keyof LensOption)[]);
}
