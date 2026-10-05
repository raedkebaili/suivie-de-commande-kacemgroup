// =============================================================================
// Études photométriques — résolution de la lentille applicable.
// Module PUR (aucun import "@/db") : utilisé par l'API (backend) ET le
// formulaire (frontend, OrdersView), couvert par les tests A–H.
//
// RÈGLE MÉTIER (priorité absolue) :
//   lentille choisie dans l'étude  >  lentille générale de l'article
//   Pour une étude liée à une commande, l'API persiste aussi cette valeur dans
//   la spécification existante de l'article, avec traçabilité, sans nouvelle ligne.
// =============================================================================

export type LensValue = { reference: string; label: string } | null;

/** Source de la lentille effective : étude (imposée), article (défaut), ou aucune. */
export type LensSource = "study" | "article" | null;

export type ResolvedLens = {
  /** Lentille applicable à l'étude (affichage + exploitation technique). */
  effective: LensValue;
  /** Provenance : 'study' (🔒 imposée) · 'article' (défaut) · null (aucune). */
  source: LensSource;
  /** true si l'étude se superpose à une spec article existante (⇒ message §13). */
  overridden: boolean;
};

export const LENS_OVERRIDE_MESSAGE =
  "La lentille sélectionnée dans cette étude se superpose à la spécification existante de l'article en raison des exigences de l'étude photométrique. Cette lentille sera appliquée obligatoirement à cette étude.";

/**
 * Cas 1 — étude sans lentille + article LENS-A  → LENS-A (source 'article').
 * Cas 2 — étude LENS-B + article LENS-A         → LENS-B (source 'study', overridden).
 * Cas 3 — étude LENS-C + article sans lentille  → LENS-C (source 'study').
 * Cas 0 — aucune des deux                      → null.
 */
export function resolveStudyLens(articleLens: LensValue, studyLens: LensValue): ResolvedLens {
  if (studyLens) {
    return { effective: studyLens, source: "study", overridden: articleLens !== null };
  }
  if (articleLens) {
    return { effective: articleLens, source: "article", overridden: false };
  }
  return { effective: null, source: null, overridden: false };
}

/** Normalise une référence de lentille article (texte libre) en LensValue comparable. */
export function articleLensToValue(lens: string | null | undefined): LensValue {
  const ref = (lens || "").trim();
  if (!ref) return null;
  return { reference: ref, label: "Spécification article" };
}

/** Libellé + badge d'affichage selon la source (cf. §16). */
export function lensSourceBadge(source: LensSource): { text: string; locked: boolean } {
  if (source === "study") return { text: "🔒 Imposée par l'étude photométrique", locked: true };
  if (source === "article") return { text: "Valeur par défaut de l'article", locked: false };
  return { text: "Aucune lentille définie", locked: false };
}

/**
 * Retourne la ligne la plus récente pour un article dans une liste d'études
 * déjà triée par le serveur. Une ligne récente sans lentille est volontairement
 * retournée : elle neutralise une imposition plus ancienne.
 */
export function latestStudyItemForOrderItem<T extends { orderItemId?: number | null }>(
  studies: { items: T[] }[],
  orderItemId: number,
): T | null {
  for (const study of studies) {
    const item = study.items.find(candidate => candidate.orderItemId === orderItemId);
    if (item) return item;
  }
  return null;
}
