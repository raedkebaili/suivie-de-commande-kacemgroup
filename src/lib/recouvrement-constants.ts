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

/** États de recouvrement par défaut (catalogue initial, enrichissable) */
export const DEFAULT_RECOUVREMENT_STATES: DefaultRecouvrementState[] = [
  { key: "A_ECHEANCE",            label: "À échéance",            description: "Facture créée mais la date d'échéance n'est pas encore atteinte.",              colorKey: "RECOUVREMENT_GREEN",     sortOrder: 10 },
  { key: "ECHEANCE_PROCHE",       label: "Échéance proche",       description: "L'échéance approche, par exemple dans les 7 jours.",                              colorKey: "RECOUVREMENT_YELLOW",    sortOrder: 20 },
  { key: "RELANCE_1",             label: "Relance 1",             description: "Première relance envoyée au client.",                                             colorKey: "RECOUVREMENT_ORANGE",    sortOrder: 30 },
  { key: "RELANCE_2",             label: "Relance 2",             description: "Deuxième relance après absence de paiement.",                                     colorKey: "RECOUVREMENT_ORANGE",    sortOrder: 40 },
  { key: "EN_RETARD",             label: "En retard",             description: "La facture est échue et toujours impayée.",                                       colorKey: "RECOUVREMENT_RED",       sortOrder: 50 },
  { key: "RETARD_IMPORTANT",      label: "Retard important",      description: "Retard dépassant un seuil défini, par exemple 30 jours.",                         colorKey: "RECOUVREMENT_DARK_RED",  sortOrder: 60 },
  { key: "RELANCE_URGENTE",       label: "Relance urgente",       description: "Situation nécessitant une intervention rapide.",                                  colorKey: "RECOUVREMENT_DARK_RED",  sortOrder: 70 },
  { key: "PROMESSE_PAIEMENT",     label: "Promesse de paiement",  description: "Le client a confirmé qu'il paiera à une date précise.",                           colorKey: "RECOUVREMENT_BLUE",      sortOrder: 80 },
  { key: "PAIEMENT_PARTIEL",      label: "Paiement partiel",      description: "Une partie de la facture a été réglée.",                                          colorKey: "RECOUVREMENT_PURPLE",    sortOrder: 90 },
  { key: "ECHELONNEMENT",         label: "Échelonnement",         description: "Un accord de paiement en plusieurs échéances a été établi.",                      colorKey: "RECOUVREMENT_PURPLE",    sortOrder: 100 },
  { key: "LITIGE_CLIENT",         label: "Litige client",         description: "Le client conteste tout ou partie de la facture.",                                colorKey: "RECOUVREMENT_BROWN",     sortOrder: 110 },
  { key: "BLOCAGE_ADMINISTRATIF", label: "Blocage administratif", description: "Le paiement est bloqué pour une raison administrative/documentaire.",             colorKey: "RECOUVREMENT_BROWN",     sortOrder: 120 },
  { key: "CONTENTIEUX",           label: "Contentieux",           description: "Le dossier est transmis à une procédure de recouvrement/contentieux.",            colorKey: "RECOUVREMENT_BLACK",     sortOrder: 130 },
  { key: "CREANCE_DOUTEUSE",      label: "Créance douteuse",      description: "Risque important de non-recouvrement.",                                           colorKey: "RECOUVREMENT_GRAY",      sortOrder: 140 },
  { key: "CREANCE_IRRECOUVRABLE", label: "Créance irrécouvrable", description: "La créance est considérée comme non récupérable.",                                colorKey: "RECOUVREMENT_DARK_GRAY", sortOrder: 150 },
  { key: "PAYEE",                 label: "Payée",                 description: "Facture entièrement réglée.",                                                     colorKey: "RECOUVREMENT_EMERALD",   sortOrder: 160 },
  { key: "CLOTUREE",              label: "Clôturée",              description: "Dossier de recouvrement terminé et archivé.",                                     colorKey: "RECOUVREMENT_TEAL",      sortOrder: 170 },
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
