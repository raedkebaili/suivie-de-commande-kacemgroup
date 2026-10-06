import { db } from "@/db";
import { userAgencyAccess } from "@/db/schema";
import { eq } from "drizzle-orm";
export { agencyScopeForUser } from "./agency-scope";

/**
 * Agences attribuées à un utilisateur. Les affectations ne sont utilisées
 * comme périmètre que pour le rôle autonome `acces_agence`.
 */
export async function getAssignedAgencyIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ agencyId: userAgencyAccess.agencyId })
    .from(userAgencyAccess)
    .where(eq(userAgencyAccess.userId, userId));
  return rows.map((row) => row.agencyId);
}
