/**
 * Calcule la portée agence effective.
 * Le rôle Accès agence est le seul rôle métier restreint par les affectations.
 */
export function agencyScopeForUser(user: { role: string; agencyIds?: number[] | null }): number[] | null {
  if (user.role === "superadmin") return null;
  // Les affectations éventuelles d'un autre rôle ne modifient jamais ses droits.
  if (user.role !== "acces_agence") return null;
  // Un rôle sans affectation ne doit rien voir. L'API utilisateurs refuse
  // normalement sa création sans agence ; [] reste défensif pour l'historique.
  return user.agencyIds || [];
}
