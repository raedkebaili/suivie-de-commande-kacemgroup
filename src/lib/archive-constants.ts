/**
 * Archive commandes — constantes partagées (client + serveur).
 * NE PAS importer "@/db" ici : utilisé par des composants client.
 *
 * ISOLATION : les clés de couleur du module Archive sont préfixées « ARCHIVE_ »
 * et rangées dans la catégorie « archive » de app_colors. Elles n'ont AUCUN
 * lien avec les clés du tableau de suivi des commandes (LIVREE, PREVISION, …).
 * Modifier « Archive → Livré » n'affecte donc jamais le tableau actuel, et
 * inversement.
 */

export const ARCHIVE_COLOR_CATEGORY = "archive";

export type ArchiveStateKey = "LIVRE" | "PREVISION" | "PRET_A_LIVRE" | "ANNULE";

export type ArchiveStateDef = {
  key: ArchiveStateKey;
  label: string;
  /** Clé dans app_colors (catégorie "archive") — distincte du tableau de suivi */
  colorKey: string;
  defaultColor: string;
  description: string;
  sortOrder: number;
};

export const ARCHIVE_STATES: ArchiveStateDef[] = [
  { key: "LIVRE",        label: "Livré",        colorKey: "ARCHIVE_STATE_LIVRE",        defaultColor: "#22c55e", description: "Archive — ligne livrée (vert)",           sortOrder: 400 },
  { key: "PREVISION",    label: "Prévision",    colorKey: "ARCHIVE_STATE_PREVISION",    defaultColor: "#f97316", description: "Archive — ligne en prévision (orangé)",   sortOrder: 410 },
  { key: "PRET_A_LIVRE", label: "Prêt à livré", colorKey: "ARCHIVE_STATE_PRET_A_LIVRE", defaultColor: "#facc15", description: "Archive — ligne prête à livrer (jaune)",  sortOrder: 420 },
  { key: "ANNULE",       label: "Annulé",       colorKey: "ARCHIVE_STATE_ANNULE",       defaultColor: "#ef4444", description: "Archive — ligne annulée (rouge)",         sortOrder: 430 },
];

/** Palette proposée pour la couleur personnalisée d'une cellule d'archive */
export const ARCHIVE_CELL_PALETTE: { label: string; color: string }[] = [
  { label: "Bleu",       color: "#3b82f6" },
  { label: "Bleu clair", color: "#93c5fd" },
  { label: "Vert",       color: "#22c55e" },
  { label: "Vert clair", color: "#86efac" },
  { label: "Jaune",      color: "#facc15" },
  { label: "Orange",     color: "#f97316" },
  { label: "Rouge",      color: "#ef4444" },
  { label: "Violet",     color: "#a855f7" },
  { label: "Rose",       color: "#ec4899" },
  { label: "Gris",       color: "#9ca3af" },
  { label: "Blanc",      color: "#ffffff" },
  { label: "Noir",       color: "#111827" },
];

export const ARCHIVE_STATE_BY_KEY: Record<string, ArchiveStateDef> = Object.fromEntries(
  ARCHIVE_STATES.map((s) => [s.key, s]),
);

export function archiveStateLabel(key: string | null | undefined): string {
  return key ? ARCHIVE_STATE_BY_KEY[key]?.label ?? key : "—";
}

/**
 * Détecte si une valeur de cellule « Reste à livrer » vaut zéro.
 * IMPORTANT : une cellule VIDE ne doit jamais être interprétée comme 0.
 * Retourne null si la valeur est vide ou non numérique.
 */
export function parseResteALivrer(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null; // cellule vide → PAS zéro
  // Accepte "0", "0,00", "1 234.5", etc.
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * État effectif d'une ligne d'archive.
 * 1. état défini manuellement par l'administrateur (prioritaire) ;
 * 2. sinon, « Reste à livrer » = 0 → LIVRE ;
 * 3. sinon, aucun état (null) — la ligne reste neutre.
 */
export function resolveArchiveRowState(
  stateOverride: string | null | undefined,
  resteRaw: string | null | undefined,
): ArchiveStateKey | null {
  if (stateOverride && ARCHIVE_STATE_BY_KEY[stateOverride]) return stateOverride as ArchiveStateKey;
  const reste = parseResteALivrer(resteRaw);
  if (reste === 0) return "LIVRE";
  return null;
}

/** Détecte l'index de la colonne « Reste à livrer » parmi les en-têtes */
export function detectResteColumnIndex(columns: string[]): number | null {
  const norm = (s: string) =>
    (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (let i = 0; i < columns.length; i++) {
    const c = norm(columns[i]);
    if (c.includes("reste") && (c.includes("livr") || c.includes("liver"))) return i;
  }
  for (let i = 0; i < columns.length; i++) {
    if (norm(columns[i]).includes("reste")) return i;
  }
  return null;
}
