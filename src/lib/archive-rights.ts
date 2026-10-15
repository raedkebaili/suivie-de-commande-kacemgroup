/**
 * Droits d'édition de l'archive commandes (partagés route serveur + interface).
 *
 * - Changer l'état d'une ligne : superadmin et responsable planification.
 * - Modifier les champs (cellules) : superadmin, planification, technique, commercial.
 * - Une cellule modifiée par un commercial reçoit le marquage « modifié »
 *   (couleur FIELD_MODIFIED du gestionnaire de couleurs).
 * - Les couleurs personnalisées de cellules restent réservées au superadmin.
 */

export type ArchiveRights = {
  canChangeState: boolean;
  canEditCells: boolean;
  marksCommercialEdits: boolean;
};

const NO_RIGHTS: ArchiveRights = { canChangeState: false, canEditCells: false, marksCommercialEdits: false };

export function archiveRightsFor(role: string | null | undefined): ArchiveRights {
  switch (role) {
    case "superadmin":
      return { canChangeState: true, canEditCells: true, marksCommercialEdits: false };
    case "planification":
      return { canChangeState: true, canEditCells: true, marksCommercialEdits: false };
    case "technique":
      return { canChangeState: false, canEditCells: true, marksCommercialEdits: false };
    case "commercial":
      return { canChangeState: false, canEditCells: true, marksCommercialEdits: true };
    default:
      return NO_RIGHTS;
  }
}

/** Indices des cellules dont la valeur a changé entre deux versions d'une ligne. */
export function changedCellIndexes(previous: string[], next: string[]): number[] {
  const changed: number[] = [];
  const width = Math.max(previous.length, next.length);
  for (let index = 0; index < width; index++) {
    if ((previous[index] ?? "") !== (next[index] ?? "")) changed.push(index);
  }
  return changed;
}
