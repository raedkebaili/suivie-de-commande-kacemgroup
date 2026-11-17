import { and, eq, isNull, or } from "drizzle-orm";
import { dpmGrants, users } from "@/db/schema";
import type { db } from "@/db";
export const DPM_CAPABILITIES = ["READ", "DECLARE", "TECHNICAL_REVIEW", "IMPACT_ANALYSIS", "LOGISTICS_REVIEW", "INDUSTRIAL_APPROVAL", "CONFIGURE"] as const;
export type DpmCapability = typeof DPM_CAPABILITIES[number];
export class DpmAccessDenied extends Error {}
// The caller supplies the authenticated account, never a role-based fallback.
export async function requireDpmCapability(tx: Pick<typeof db, "select">, userId: number, factoryId: number, capability: DpmCapability) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(factoryId) || factoryId <= 0 || !DPM_CAPABILITIES.includes(capability)) throw new DpmAccessDenied("Accès DPM refusé");
  const grants = await tx.select({ id: dpmGrants.id }).from(dpmGrants).innerJoin(users,eq(users.id,dpmGrants.userId)).where(and(
    eq(users.active,true),
    eq(dpmGrants.userId, userId), eq(dpmGrants.active, true), eq(dpmGrants.capability, capability),
    or(eq(dpmGrants.factoryId, factoryId), isNull(dpmGrants.factoryId)),
  )).limit(1);
  if (!grants.length) throw new DpmAccessDenied("Habilitation DPM explicite requise pour ce site");
}
