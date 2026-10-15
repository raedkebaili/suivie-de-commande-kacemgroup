/**
 * Recouvrement — constantes partagées (client + serveur).
 * NE PAS importer "@/db" ici : ce fichier est utilisé par des composants client.
 *
 * Les "tones" sont des couleurs persistées dans app_colors (catégorie
 * "recouvrement") afin de rester modifiables depuis l'onglet Couleurs
 * de l'administrateur système. Les états référencent un tone par colorKey.
 */

export type RecouvrementTone = { key: string; label: string; color: string; sortOrder: number };

export const RECOUVREMENT_COLOR_CATEGORY = "recouvrement";

/** Palette de couleurs proposée pour les états de recouvrement */
export const RECOUVREMENT_TONES: RecouvrementTone[] = [
  { key: "RECOUVREMENT_GREEN",    label: "Vert",              color: "#22c55e", sortOrder: 200 },
  { key: "RECOUVREMENT_EMERALD",  label: "Vert émeraude",     color: "#10b981", sortOrder: 210 },
  { key: "RECOUVREMENT_TEAL",     label: "Bleu-vert",         color: "#0d9488", sortOrder: 220 },
  { key: "RECOUVREMENT_YELLOW",   label: "Jaune",             color: "#eab308", sortOrder: 230 },
  { key: "RECOUVREMENT_ORANGE",   label: "Orange",            color: "#f97316", sortOrder: 240 },
  { key: "RECOUVREMENT_RED",      label: "Rouge",             color: "#ef4444", sortOrder: 250 },
  { key: "RECOUVREMENT_DARK_RED", label: "Rouge foncé",       color: "#b91c1c", sortOrder: 260 },
  { key: "RECOUVREMENT_BLUE",     label: "Bleu",              color: "#3b82f6", sortOrder: 270 },
  { key: "RECOUVREMENT_PURPLE",   label: "Violet",            color: "#a855f7", sortOrder: 280 },
  { key: "RECOUVREMENT_BROWN",    label: "Marron",            color: "#92400e", sortOrder: 290 },
  { key: "RECOUVREMENT_BLACK",    label: "Noir",              color: "#111827", sortOrder: 300 },
  { key: "RECOUVREMENT_DARK_GRAY",label: "Gris foncé",        color: "#374151", sortOrder: 310 },
  { key: "RECOUVREMENT_GRAY",     label: "Gris",              color: "#9ca3af", sortOrder: 320 },
];

export type DefaultRecouvrementState = {
  key: string; label: string; description: string; colorKey: string; sortOrder: number;
};

/** États de recouvrement installés lors de la migration du catalogue. */
export const DEFAULT_RECOUVREMENT_STATES: DefaultRecouvrementState[] = [
  {
    key: "RETARD_IMPORTANT",
    label: "Retard important",
    description: "Retard de paiement nécessitant un suivi prioritaire.",
    colorKey: "RECOUVREMENT_DARK_RED",
    sortOrder: 10,
  },
  {
    key: "CLIENT_BLOQUE",
    label: "Client Bloqué",
    description: "Client bloqué jusqu'à régularisation de sa situation.",
    colorKey: "RECOUVREMENT_BLACK",
    sortOrder: 20,
  },
];

/** Rôles autorisés à gérer le recouvrement (catalogue + affectations) */
export const RECOUVREMENT_MANAGER_ROLES = ["superadmin", "recouvrement"] as const;

/** Génère une clé technique stable à partir d'un libellé ("Relance 1" -> "RELANCE_1") */
export function recouvrementKeyFromLabel(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `ETAT_${Date.now()}`;
}
