/**
 * Priorités de commande — module partagé (client + serveur).
 * NE PAS importer "@/db" ici.
 *
 * Nouveau modèle destiné au planificateur : 10 niveaux ordonnés
 * (« Priorité 1 » = la plus urgente … « Priorité 10 ») + « Normale ».
 *
 * RÉTROCOMPATIBILITÉ : les valeurs historiques (NORMALE, URGENTE,
 * TRES_URGENTE, PREVISION) restent lisibles et affichables. Elles ne sont
 * simplement plus proposées à la création ; les commandes existantes
 * continuent de fonctionner sans migration de données (colonne texte).
 */

export const PRIORITY_LEVEL_COUNT = 10;

/** Clés numériques ordonnées : P1 (plus urgente) … P10 */
export const NUMERIC_PRIORITIES: string[] = Array.from(
  { length: PRIORITY_LEVEL_COUNT },
  (_, i) => `P${i + 1}`,
);

/** Valeur par défaut, hors file d'attente priorisée */
export const PRIORITY_NORMALE = "NORMALE";

/** Options proposées dans les listes déroulantes : Priorité 1 … 10, puis Normale */
export const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  ...NUMERIC_PRIORITIES.map((key, i) => ({ value: key, label: `Priorité ${i + 1}` })),
  { value: PRIORITY_NORMALE, label: "Normale" },
];

/** Anciennes valeurs conservées pour l'affichage de l'historique */
export const LEGACY_PRIORITY_LABELS: Record<string, string> = {
  PREVISION: "Prévision",
  NORMALE: "Normale",
  URGENTE: "Urgente",
  TRES_URGENTE: "Très Urgente",
};

/** true si la priorité fait partie de la file numérotée (P1…P10) */
export function isNumericPriority(priority: string | null | undefined): boolean {
  return !!priority && NUMERIC_PRIORITIES.includes(priority);
}

/** Niveau numérique (1…10), ou null si la priorité n'est pas numérotée */
export function priorityLevel(priority: string | null | undefined): number | null {
  if (!isNumericPriority(priority)) return null;
  const n = parseInt(String(priority).slice(1), 10);
  return Number.isFinite(n) ? n : null;
}

/** Clé de priorité depuis un niveau (1 → "P1") ; null hors bornes */
export function priorityFromLevel(level: number): string | null {
  if (!Number.isFinite(level) || level < 1 || level > PRIORITY_LEVEL_COUNT) return null;
  return `P${level}`;
}

/** Libellé lisible, toutes générations confondues */
export function priorityLabel(priority: string | null | undefined): string {
  if (!priority) return "Normale";
  const lvl = priorityLevel(priority);
  if (lvl !== null) return `Priorité ${lvl}`;
  return LEGACY_PRIORITY_LABELS[priority] || priority;
}

/**
 * Clé de couleur (table app_colors) associée à une priorité.
 * Les priorités numérotées ont leurs propres clés PRIORITY_P1…P10 :
 * elles n'interfèrent pas avec les couleurs historiques.
 */
export function priorityColorKey(priority: string | null | undefined): string {
  const lvl = priorityLevel(priority);
  if (lvl !== null) return `PRIORITY_P${lvl}`;
  if (priority === "URGENTE") return "PRIORITY_URGENTE";
  if (priority === "TRES_URGENTE") return "PRIORITY_TRES_URGENTE";
  return "PRIORITY_NORMALE";
}

/** Ordre de tri : P1 en premier … P10, puis les autres (Normale/legacy) */
export function prioritySortRank(priority: string | null | undefined): number {
  const lvl = priorityLevel(priority);
  if (lvl !== null) return lvl;
  if (priority === "TRES_URGENTE") return 0.5; // historiquement la plus forte
  if (priority === "URGENTE") return 0.8;
  return 999;
}
