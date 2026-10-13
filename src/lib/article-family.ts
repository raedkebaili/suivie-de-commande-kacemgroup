/**
 * Classification automatique des désignations d'articles (famille, puissance,
 * génération). Module PUR : aucun import DB, utilisé côté serveur et client.
 *
 * Principes :
 * - La désignation originale n'est JAMAIS modifiée : elle est seulement lue.
 * - Une désignation est reconnue uniquement si elle correspond entièrement au
 *   motif « FAMILLE [génération] [puissance] [W] ». Tout le reste est « À classifier ».
 * - La famille commerciale est le nom alphabétique (ex. NETLUX, APOLLO+).
 * - La génération est une version décimale explicite (ex. 2.0). Elle distingue
 *   deux familles : « NETLUX » et « NETLUX 2.0 ».
 * - La puissance est le nombre de 2 à 4 chiffres (ex. 100). Elle NE détermine
 *   JAMAIS la famille : deux articles de même puissance restent distincts.
 * - Aucune liste de familles n'est codée en dur : les familles sont celles
 *   présentes dans les désignations elles-mêmes.
 * - Le préfixe commun n'a aucune valeur : NETLUX et NETLUXE sont deux familles.
 */

export const ARTICLE_FAMILY_STATUS = {
  RECONNU: "RECONNU",
  A_CLASSIFIER: "A_CLASSIFIER",
} as const;
export type ArticleFamilyStatus = (typeof ARTICLE_FAMILY_STATUS)[keyof typeof ARTICLE_FAMILY_STATUS];

export const ARTICLE_FAMILY_STATUS_LABELS: Record<ArticleFamilyStatus, string> = {
  RECONNU: "Reconnu",
  A_CLASSIFIER: "À classifier",
};

/** Clé de regroupement des articles non classés (jamais attribués à une famille) */
export const UNCLASSIFIED_GROUP_KEY = "À classifier";

export type ArticleFamilyInfo = {
  /** Désignation originale, telle que saisie (inchangée) */
  designation: string;
  status: ArticleFamilyStatus;
  /** Famille commerciale (ex. NETLUX, APOLLO+) ; null si À classifier */
  family: string | null;
  /** Génération / version (ex. 2.0) ; null si absente */
  generation: string | null;
  /** Puissance en watts ; null si absente ou non identifiable */
  power: number | null;
  /** Clé de regroupement : famille + génération (ex. « NETLUX 2.0 ») ; null si À classifier */
  familyKey: string | null;
};

/**
 * Normalisation sans altération de sens : accents, casse, espaces insécables,
 * tirets typographiques, virgule décimale entre chiffres.
 */
export function normalizeDesignation(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\u00A0\u2007\u202F\t]/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/(\d),(\d)/g, "$1.$2")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// FAMILLE (lettres, « + » autorisé) [séparateur] [génération N.N] [séparateur] [puissance 2-4 chiffres] [W]
const DESIGNATION_PATTERN = /^([A-Z]{2,}\+*)[\s_-]*(?:(\d\.\d)[\s_-]*)?(?:(\d{2,4})(?:\s*W(?:ATTS?)?)?)?$/;

export function classifyArticleDesignation(designation: string): ArticleFamilyInfo {
  const original = designation ?? "";
  const normalized = normalizeDesignation(original);
  const match = normalized ? DESIGNATION_PATTERN.exec(normalized) : null;

  if (!match) {
    return { designation: original, status: ARTICLE_FAMILY_STATUS.A_CLASSIFIER, family: null, generation: null, power: null, familyKey: null };
  }

  const family = match[1];
  const generation = match[2] || null;
  const power = match[3] ? parseInt(match[3], 10) : null;
  const familyKey = generation ? `${family} ${generation}` : family;

  return { designation: original, status: ARTICLE_FAMILY_STATUS.RECONNU, family, generation, power, familyKey };
}

/** Clé de regroupement d'une désignation (famille + génération, ou « À classifier ») */
export function familyGroupKey(designation: string): string {
  return classifyArticleDesignation(designation).familyKey ?? UNCLASSIFIED_GROUP_KEY;
}
