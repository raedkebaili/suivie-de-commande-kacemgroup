/**
 * Planning de production — constantes partagées (client + serveur).
 * NE PAS importer "@/db" ici.
 *
 * ISOLATION : les clés de couleur sont préfixées « PLANNING_ » et rangées dans
 * la catégorie « planning » de app_colors. Elles n'interfèrent ni avec les
 * statuts de commande, ni avec l'archive, ni avec le recouvrement.
 */

export const PLANNING_COLOR_CATEGORY = "planning";

export type PlanningStatus = "EN_COURS" | "SUSPENDU" | "ANNULE" | "TERMINE";

export type PlanningStatusDef = {
  key: PlanningStatus;
  label: string;
  colorKey: string;
  defaultColor: string;
  description: string;
  sortOrder: number;
  /** true = la ligne clignote (production réellement en cours) */
  blink: boolean;
  /** true = un motif doit être saisi dans la colonne « Raison » */
  requiresReason: boolean;
};

export const PLANNING_STATUSES: PlanningStatusDef[] = [
  { key: "EN_COURS",  label: "En cours de production", colorKey: "PLANNING_EN_COURS",  defaultColor: "#eab308", description: "Planning — production en cours (clignotant)", sortOrder: 500, blink: true,  requiresReason: false },
  { key: "SUSPENDU",  label: "Suspendu",               colorKey: "PLANNING_SUSPENDU",  defaultColor: "#f97316", description: "Planning — production suspendue",            sortOrder: 510, blink: false, requiresReason: true },
  { key: "ANNULE",    label: "Annulé",                 colorKey: "PLANNING_ANNULE",    defaultColor: "#ef4444", description: "Planning — production annulée",              sortOrder: 520, blink: false, requiresReason: true },
  { key: "TERMINE",   label: "Terminé",                colorKey: "PLANNING_TERMINE",   defaultColor: "#22c55e", description: "Planning — production terminée",             sortOrder: 530, blink: false, requiresReason: false },
];

export const PLANNING_STATUS_BY_KEY: Record<string, PlanningStatusDef> =
  Object.fromEntries(PLANNING_STATUSES.map((s) => [s.key, s]));

export function planningStatusLabel(key: string | null | undefined): string {
  return key ? PLANNING_STATUS_BY_KEY[key]?.label ?? key : "—";
}

export function isValidPlanningStatus(key: unknown): key is PlanningStatus {
  return typeof key === "string" && key in PLANNING_STATUS_BY_KEY;
}

/** Statuts pour lesquels la ligne doit clignoter (production en cours) */
export function planningStatusBlinks(key: string | null | undefined): boolean {
  return !!key && PLANNING_STATUS_BY_KEY[key]?.blink === true;
}

/** Rôles autorisés à gérer le planning (création, états, raisons) */
export const PLANNING_MANAGER_ROLES = ["superadmin", "planification"] as const;

/** Date du jour au format YYYY-MM-DD (fuseau local) */
export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
