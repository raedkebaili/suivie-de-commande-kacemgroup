/**
 * Regroupement des articles de commande.
 *
 * Règle métier : deux articles appartiennent au même groupe s'ils ont la même
 * FAMILLE identifiée (famille commerciale + génération), indépendamment de la
 * puissance. Ex. « NETLUX 100 W » et « NETLUX 150 W » → groupe « NETLUX » ;
 * « NETLUX 2.0 100 W » → groupe « NETLUX 2.0 » (famille distincte).
 * Les désignations non reconnues forment le groupe « À classifier », affiché
 * en dernier et jamais rattaché arbitrairement à une famille.
 * La règle des 4 premiers caractères a été supprimée.
 * La classification elle-même est dans src/lib/article-family.ts.
 *
 * Ce module est PUR (aucun import DB) : il est utilisé côté serveur pour
 * l'export Excel et côté client pour l'affichage, garantissant un résultat
 * strictement identique entre les deux.
 */

import { classifyArticleDesignation, familyGroupKey, resolveDesignationFamily, UNCLASSIFIED_GROUP_KEY, type FamilySource } from "./article-family";

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
  /** Puissance (W) lue dans la désignation ; null si absente */
  power: number | null;
  /** Origine de la famille de cette ligne ; null si À classifier */
  familySource: FamilySource | null;
};

/** Sous-total d'un groupe pour une puissance donnée (null = puissance non précisée) */
export type PowerBreakdown = {
  power: number | null;
  lines: number;
  quantity: number;
  producedQty: number;
  deliveredQty: number;
  remaining: number;
};

export type ArticleGroup = {
  /** Clé du groupe : famille identifiée (ex. « NETLUX 2.0 ») ou « À classifier » */
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
  /** Répartition par puissance (triée croissante, puissance inconnue en dernier) */
  powerBreakdown: PowerBreakdown[];
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

/** Clé de regroupement : famille identifiée, ou « À classifier » */
export function articleGroupKey(name: string): string {
  return familyGroupKey(name);
}

/**
 * Regroupe une liste d'articles par famille identifiée.
 * `manualFamilies` : désignation exacte → libellé de famille affecté manuellement.
 * Les familles sont triées alphabétiquement, « À classifier » est placé en dernier.
 * Les lignes sont triées par article puis affaire.
 */
export function groupArticles(items: GroupableItem[], manualFamilies?: ReadonlyMap<string, string>): ArticleGroup[] {
  const map = new Map<string, ArticleGroup>();

  for (const item of items) {
    // Affectation manuelle (catalogue admin) prioritaire ; sinon classification automatique
    const key = resolveDesignationFamily(item.articleName, manualFamilies?.get(item.articleName) ?? null).familyKey
      ?? UNCLASSIFIED_GROUP_KEY;
    const resolved = resolveDesignationFamily(item.articleName, manualFamilies?.get(item.articleName) ?? null);
    const power = classifyArticleDesignation(item.articleName).power;
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
        powerBreakdown: [],
      };
      map.set(key, group);
    }

    const quantity = Number(item.quantity) || 0;
    const producedQty = Number(item.producedQty) || 0;
    const deliveredQty = Number(item.deliveredQty) || 0;
    const remaining = Math.max(0, quantity - deliveredQty);

    group.lines.push({ ...item, quantity, producedQty, deliveredQty, remaining, power, familySource: resolved.source });

    let bucket = group.powerBreakdown.find(b => b.power === power);
    if (!bucket) {
      bucket = { power, lines: 0, quantity: 0, producedQty: 0, deliveredQty: 0, remaining: 0 };
      group.powerBreakdown.push(bucket);
    }
    bucket.lines += 1;
    bucket.quantity += quantity;
    bucket.producedQty += producedQty;
    bucket.deliveredQty += deliveredQty;
    bucket.remaining += remaining;
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
    g.powerBreakdown.sort((a, b) => {
      if (a.power === null) return 1;
      if (b.power === null) return -1;
      return a.power - b.power;
    });
    // Tri : article puis affaire (regroupement lisible « article → affaires »)
    g.lines.sort((a, b) => {
      const byArticle = (a.articleName || "").localeCompare(b.articleName || "", "fr");
      if (byArticle !== 0) return byArticle;
      return (a.affaire || "").localeCompare(b.affaire || "", "fr");
    });
    g.label = g.variants.length > 0 ? `${g.key} — ${g.variants[0]}${g.variants.length > 1 ? ` (+${g.variants.length - 1})` : ""}` : g.key;
  }
  groups.sort((a, b) => {
    if (a.key === UNCLASSIFIED_GROUP_KEY) return 1;
    if (b.key === UNCLASSIFIED_GROUP_KEY) return -1;
    return a.key.localeCompare(b.key, "fr");
  });
  return groups;
}
