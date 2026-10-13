/**
 * Catalogue manuel des familles d'articles (partagé client + serveur).
 * NE PAS importer "@/db" ici.
 *
 * Hiérarchie : FAMILLE (catégorie) > SOUS FAMILLE (famille commerciale) > VARIANTE.
 * Le LIBELLÉ de regroupement est « sous-famille + variante » (ex. « NETLUX 2.0 »,
 * « LUXSTAR I », « APOLO+ »). Il correspond à la clé utilisée par le tableau
 * récapitulatif ; deux entrées du catalogue ne peuvent pas avoir le même libellé.
 */

export type ArticleFamilyCatalogEntry = {
  category: string;
  subFamily: string;
  /** Chaîne vide lorsqu'il n'y a pas de variante */
  variant: string;
};

export const CATALOG_TEXT_MAX_LENGTH = 120;
export const CATALOG_VARIANT_MAX_LENGTH = 40;

/** Catalogue prédéfini fourni par l'administration (identique à la migration 0005) */
export const PREDEFINED_ARTICLE_FAMILY_CATALOG: readonly ArticleFamilyCatalogEntry[] = [
  { category: "LUMINAIRE D'ECLAIRAGE PUBLIQUE", subFamily: "NETLUX", variant: "" },
  { category: "LUMINAIRE D'ECLAIRAGE PUBLIQUE", subFamily: "NETLUX", variant: "2.0" },
  { category: "LUMINAIRE D'ECLAIRAGE PUBLIQUE", subFamily: "LUXSTAR", variant: "I" },
  { category: "LUMINAIRE D'ECLAIRAGE PUBLIQUE", subFamily: "LUXSTAR", variant: "II" },
  { category: "PROJECTEUR LED", subFamily: "APOLO", variant: "" },
  { category: "PROJECTEUR LED", subFamily: "ASTRO", variant: "" },
  { category: "PROJECTEUR LED", subFamily: "EUROARENA", variant: "" },
  { category: "PROJECTEUR LED", subFamily: "EUROARENA", variant: "PRO" },
  { category: "PROJECTEUR LED", subFamily: "EUROSTATION", variant: "" },
  { category: "PROJECTEUR LED", subFamily: "PROJECTEUR SOLAIRE", variant: "" },
  { category: "PROJECTEUR LED", subFamily: "PROJECTEUR SUR RAILLE", variant: "" },
  { category: "PROJECTEUR LED", subFamily: "MARACANA", variant: "" },
  { category: "PROJECTEUR LED", subFamily: "APOLO", variant: "+" },
  { category: "LUMINAIRE DE STYLE", subFamily: "MEDINA", variant: "" },
  { category: "LUMINAIRE DE STYLE", subFamily: "TOKYO", variant: "" },
  { category: "LUMINAIRE DE STYLE", subFamily: "ANDALUS", variant: "" },
  { category: "LUMINAIRE DE STYLE", subFamily: "VENUS", variant: "" },
  { category: "LUMINAIRE DE STYLE", subFamily: "CELIA", variant: "" },
  { category: "LUMINAIRE DE STYLE", subFamily: "SPACE X", variant: "" },
  { category: "POTEAU DE STYLE", subFamily: "POTEAU", variant: "4m" },
  { category: "POTEAU DE STYLE", subFamily: "POTEAU", variant: "3m" },
];

/** Nettoyage d'un texte saisi : espaces superflus supprimés, casse conservée */
export function cleanCatalogText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Libellé de regroupement d'une entrée (sous-famille + variante) */
export function catalogLabel(entry: { subFamily: string; variant: string }): string {
  if (!entry.variant) return entry.subFamily;
  return entry.variant === "+" ? `${entry.subFamily}+` : `${entry.subFamily} ${entry.variant}`;
}

export type CatalogValidation =
  | { ok: true; value: ArticleFamilyCatalogEntry }
  | { ok: false; error: string };

/** Validation d'une saisie (création ou modification) — sans accès base */
export function validateCatalogEntry(input: unknown): CatalogValidation {
  const raw = (input ?? {}) as Record<string, unknown>;
  const category = cleanCatalogText(raw.category);
  const subFamily = cleanCatalogText(raw.subFamily);
  const variant = cleanCatalogText(raw.variant);
  if (!category) return { ok: false, error: "La famille est obligatoire" };
  if (!subFamily) return { ok: false, error: "La sous-famille est obligatoire" };
  if (category.length > CATALOG_TEXT_MAX_LENGTH || subFamily.length > CATALOG_TEXT_MAX_LENGTH) {
    return { ok: false, error: `Libellé trop long (${CATALOG_TEXT_MAX_LENGTH} caractères maximum)` };
  }
  if (variant.length > CATALOG_VARIANT_MAX_LENGTH) {
    return { ok: false, error: `Variante trop longue (${CATALOG_VARIANT_MAX_LENGTH} caractères maximum)` };
  }
  return { ok: true, value: { category, subFamily, variant } };
}

/**
 * Deux entrées ne peuvent pas partager le même libellé de regroupement
 * (comparaison insensible à la casse) : sinon deux familles fusionneraient.
 */
export function hasDuplicateLabel(
  candidate: ArticleFamilyCatalogEntry,
  existing: readonly ArticleFamilyCatalogEntry[],
  ignoreIndex = -1,
): boolean {
  const target = catalogLabel(candidate).toLowerCase();
  return existing.some((entry, index) => index !== ignoreIndex && catalogLabel(entry).toLowerCase() === target);
}
