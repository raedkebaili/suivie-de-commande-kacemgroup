import { db } from "@/db";
import { userAgencyAccess } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Agences attribuées à un utilisateur.
 * Une liste vide signifie qu'aucune restriction n'est configurée.
 */
export async function getAssignedAgencyIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ agencyId: userAgencyAccess.agencyId })
    .from(userAgencyAccess)
    .where(eq(userAgencyAccess.userId, userId));
  return rows.map((row) => row.agencyId);
}

/**
 * Retourne la portée agence effective pour les requêtes métier.
 * null = toutes les agences ; un tableau = filtre obligatoire.
 * Le superadmin conserve toujours une visibilité globale.
 */
export function agencyScopeForUser(user: { role: string; agencyIds?: number[] | null }): number[] | null {
  if (user.role === "superadmin") return null;
  const ids = user.agencyIds || [];
  return ids.length > 0 ? ids : null;
}
