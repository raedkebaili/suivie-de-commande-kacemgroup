/**
 * Règle : le rôle planification ne peut pas FORCER une commande en « En production »
 * ou « Livrée » depuis le formulaire de détail. Ces états se soldent dans les plannings :
 *   - En production → Planning production
 *   - Livrée        → Planning d'expédition
 * En instance et Annulée restent modifiables depuis le formulaire de détail.
 *
 * Module PUR (sans accès base) : utilisé côté serveur (refus) et côté client (redirection).
 */

export const PLANNING_MANAGER_ROLE = "planification";

/** Clés d'onglet telles que définies dans src/app/page.tsx */
export type PlanningTabKey = "planning" | "expeditionPlanning";

export type PlanningRedirect = {
  tab: PlanningTabKey;
  /** Message affiché dans le planning d'arrivée */
  notice: string;
};

export function planningStateRedirect(
  role: string,
  currentState: string | null | undefined,
  nextState: string | null | undefined,
): PlanningRedirect | null {
  if (role !== PLANNING_MANAGER_ROLE) return null;
  if (!nextState || nextState === currentState) return null;
  if (nextState === "EN_PRODUCTION") {
    return { tab: "planning", notice: "Pour passer une commande en production, soldez-la ici, dans le planning de production." };
  }
  if (nextState === "LIVREE") {
    return { tab: "expeditionPlanning", notice: "Pour passer une commande en livrée, soldez les expéditions ici, dans le planning d'expédition." };
  }
  return null;
}

/** Vrai si le serveur doit refuser ce changement d'état pour ce rôle */
export function isForbiddenDirectState(role: string, currentState: string | null | undefined, nextState: string | null | undefined): boolean {
  return planningStateRedirect(role, currentState, nextState) !== null;
}

/** Message transmis au planning d'arrivée (sessionStorage : survit au changement d'onglet) */
export const PLANNING_NOTICE_KEY = "arena.planningNotice";

export function setPlanningNotice(message: string): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(PLANNING_NOTICE_KEY, message); } catch { /* stockage indisponible */ }
}

/** Lit puis efface le message ; à appeler une seule fois au montage du planning */
export function takePlanningNotice(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const message = window.sessionStorage.getItem(PLANNING_NOTICE_KEY);
    window.sessionStorage.removeItem(PLANNING_NOTICE_KEY);
    return message;
  } catch {
    return null;
  }
}
