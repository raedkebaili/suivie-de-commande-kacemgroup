/**
 * Regroupement des articles de commande.
 *
 * Règle métier : deux articles appartiennent au même groupe si leurs
 * 3 PREMIERS CARACTÈRES significatifs sont identiques.
 * Ex. « NETLUX 150 W » et « NETLUX 200 W » → même groupe (clé « NET »).
 *
 * Normalisation appliquée avant extraction de la clé :
 *   - suppression des accents
 *   - passage en majuscules
 *   - suppression des espaces / ponctuation de début
 * Les articles de moins de 3 caractères forment un groupe sur leur nom complet.
 *
 * Ce module est PUR (aucun import DB) : il est utilisé côté serveur pour
 * l'export Excel et côté client pour l'affichage, garantissant un résultat
 * strictement identique entre les deux.
 */

export type GroupableItem = {
  articleName: string;
  quantity: number;
  producedQty?: number | null;
  deliveredQty?: number | null;
  affaire?: string | null;
  clientName?: string | null;
  orderNumber?: string | null;
  orderDate?: string | null;
  productionStatus?: string | null;
};

export type GroupedLine = GroupableItem & {
  quantity: number;
  producedQty: number;
  deliveredQty: number;
  remaining: number;
};

export type ArticleGroup = {
  /** Clé technique du groupe (3 premiers caractères normalisés) */
  key: string;
  /** Libellé lisible du groupe (préfixe + nombre de variantes) */
  label: string;
  lines: GroupedLine[];
  totalQuantity: number;
  totalProduced: number;
  totalDelivered: number;
  totalRemaining: number;
  /** Noms d'articles distincts présents dans le groupe */
  variants: string[];
};

/** Normalise un nom d'article (accents, casse, espaces) */
export function normalizeArticleName(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

/** Clé de regroupement : 3 premiers caractères significatifs */
export function articleGroupKey(name: string): string {
  const normalized = normalizeArticleName(name);
  if (!normalized) return "(SANS NOM)";
  return normalized.slice(0, 3);
}

/**
 * Regroupe une liste d'articles par préfixe de 3 caractères.
 * Les groupes sont triés alphabétiquement, les lignes par article puis affaire.
 */
export function groupArticles(items: GroupableItem[]): ArticleGroup[] {
  const map = new Map<string, ArticleGroup>();

  for (const item of items) {
    const key = articleGroupKey(item.articleName);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: key,
        lines: [],
        totalQuantity: 0,
        totalProduced: 0,
        totalDelivered: 0,
        totalRemaining: 0,
        variants: [],
      };
      map.set(key, group);
    }

    const quantity = Number(item.quantity) || 0;
    const producedQty = Number(item.producedQty) || 0;
    const deliveredQty = Number(item.deliveredQty) || 0;
    const remaining = Math.max(0, quantity - deliveredQty);

    group.lines.push({ ...item, quantity, producedQty, deliveredQty, remaining });
    group.totalQuantity += quantity;
    group.totalProduced += producedQty;
    group.totalDelivered += deliveredQty;
    group.totalRemaining += remaining;
    if (item.articleName && !group.variants.includes(item.articleName)) {
      group.variants.push(item.articleName);
    }
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.variants.sort((a, b) => a.localeCompare(b, "fr"));
    // Tri : article puis affaire (regroupement lisible « article → affaires »)
    g.lines.sort((a, b) => {
      const byArticle = (a.articleName || "").localeCompare(b.articleName || "", "fr");
      if (byArticle !== 0) return byArticle;
      return (a.affaire || "").localeCompare(b.affaire || "", "fr");
    });
    g.label = g.variants.length > 0 ? `${g.key} — ${g.variants[0]}${g.variants.length > 1 ? ` (+${g.variants.length - 1})` : ""}` : g.key;
  }
  groups.sort((a, b) => a.key.localeCompare(b.key, "fr"));
  return groups;
}
