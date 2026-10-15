/**
 * Logique pure de l'interface mobile (recherche, filtres, états proposés dans le formulaire).
 * Les règles restent celles du serveur : cette couche ne fait que limiter l'affichage.
 */
import { PRIORITY_OPTIONS } from "./priority";

export const MOBILE_PRODUCTION_STATES = [
  { value: "EN_INSTANCE", label: "En instance" },
  { value: "EN_PRODUCTION", label: "En production" },
  { value: "LIVREE", label: "Livrée" },
  { value: "ANNULEE", label: "Annulée" },
] as const;

export type MobileOrderLike = {
  orderNumber: string;
  clientName?: string | null;
  agencyName?: string | null;
  affaire?: string | null;
  productionStatus?: string | null;
  priority?: string | null;
};

export type MobileOrderFilters = {
  query?: string;
  productionStatus?: string; // "" = tous
  priority?: string; // "" = toutes
};

/** Normalisation de recherche : casse et accents ignorés */
export function normalizeSearch(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Filtre les commandes par texte (numéro, client, agence, affaire) et par état / priorité */
export function filterMobileOrders<T extends MobileOrderLike>(orders: T[], filters: MobileOrderFilters): T[] {
  const q = normalizeSearch(filters.query);
  return orders.filter((o) => {
    if (filters.productionStatus && o.productionStatus !== filters.productionStatus) return false;
    if (filters.priority && o.priority !== filters.priority) return false;
    if (!q) return true;
    const haystack = normalizeSearch([o.orderNumber, o.clientName, o.agencyName, o.affaire].join(" "));
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}

/**
 * États que le rôle peut choisir depuis le formulaire mobile.
 * - Responsable planification : En instance et Annulée uniquement (« En production » et
 *   « Livrée » se soldent dans les plannings, version ordinateur).
 * - Superadmin : tous les états.
 * - Autres rôles : aucun formulaire de planification.
 */
export function mobilePlanningStateOptions(role: string): { value: string; label: string }[] {
  if (role === "superadmin") return [...MOBILE_PRODUCTION_STATES];
  if (role === "planification") return MOBILE_PRODUCTION_STATES.filter((s) => s.value === "EN_INSTANCE" || s.value === "ANNULEE");
  return [];
}

export function canEditPlanningOnMobile(role: string): boolean {
  return mobilePlanningStateOptions(role).length > 0;
}

export { PRIORITY_OPTIONS };
