/**
 * Droits d'enregistrement de la fenêtre de commande (logique pure).
 *
 * SOURCE UNIQUE pour :
 * - l'affichage du bouton « Enregistrer / Créer » de la fenêtre commande ;
 * - le choix des données envoyées par handleSave (commercial, technique, planification).
 *
 * Les règles serveur correspondantes sont dans src/app/api/orders/[id]/route.ts
 * (PUT : dynamicTechItems pour superadmin/technique, itemUpdates pour superadmin/planification).
 * Un rôle qui peut enregistrer une partie de la commande DOIT voir le bouton,
 * sinon la saisie est impossible sans message d'erreur.
 */

const COMMERCIAL_ROLES = ["superadmin", "commercial"] as const;
const TECHNIQUE_ROLES = ["superadmin", "technique"] as const;
const PLANIFICATION_ROLES = ["superadmin", "planification"] as const;

export interface OrderModalSaveRights {
  /** Édition des champs commerciaux (création, ou modification pour commercial/superadmin). */
  canEditOrderForm: boolean;
  /** Enregistrement des spécifications techniques par article (modification uniquement). */
  canSaveTechnical: boolean;
  /** Enregistrement planification : priorité, usine, date de chargement (modification uniquement). */
  canSavePlanning: boolean;
  /** Bouton « Enregistrer » / « Créer » visible. */
  showSaveButton: boolean;
}

export function orderModalSaveRights(role: string, editing: boolean): OrderModalSaveRights {
  const isPlanification = (PLANIFICATION_ROLES as readonly string[]).includes(role);
  // Le planificateur peut créer une commande, uniquement « Sur Stock / Besoin interne ».
  const canEditOrderForm =
    (COMMERCIAL_ROLES as readonly string[]).includes(role) || (isPlanification && !editing);
  const canSaveTechnical = (TECHNIQUE_ROLES as readonly string[]).includes(role) && editing;
  const canSavePlanning = isPlanification && editing;
  return {
    canEditOrderForm,
    canSaveTechnical,
    canSavePlanning,
    showSaveButton: canEditOrderForm || canSaveTechnical || canSavePlanning,
  };
}
