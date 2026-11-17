import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dpmSiteSettings, factories, dpmAuditRecords } from "@/db/schema";
import { getUserFromHeaders } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
const SITE_CODES = ["KER-01", "KER-02", "AGU-01", "AGU-02"];
async function authorize(request: NextRequest) {
  // Closed until explicit phase-2 validation. Never enabled by this change.
  if (process.env.DPM_CONFIGURATION_ENABLED !== "true") return NextResponse.json({ error: "Module non activé" }, {status:404});
  const user = await getUserFromHeaders(request);
  if (!user || user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, {status:403});
  return user;
}
export async function GET(request: NextRequest) {
  const user = await authorize(request);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ factories: await db.select().from(factories), mappings: await db.select().from(dpmSiteSettings) });
}
export async function POST(request: NextRequest) {
  const user = await authorize(request);
  if (user instanceof NextResponse) return user;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({error:"JSON invalide"},{status:400}); }
  const { factoryId, reportingCode, reason } = body ?? {};
  if (!Number.isSafeInteger(factoryId) || factoryId <= 0 || !SITE_CODES.includes(reportingCode) || typeof reason !== "string" || !reason.trim() || reason.length > 2000) {
    return NextResponse.json({error:"Site, usine et justification obligatoires"},{status:400});
  }
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(746201, 1)`);
      const [factory] = await tx.select().from(factories).where(eq(factories.id,factoryId)).for("update");
      if (!factory?.active) throw new Error("Usine inexistante ou inactive");
      // Add-only mapping. Reassignment of historical facts is not supported.
      const [mapping] = await tx.insert(dpmSiteSettings).values({factoryId, reportingCode, regionCode:reportingCode.slice(0,3), createdById:user.id, enabled:false}).returning();
      await tx.insert(dpmAuditRecords).values({entityType:"site_mapping", entityId:String(mapping.id), operation:"INSERT", reason:reason.trim(), requestKey:randomUUID(), afterData:mapping, capabilityUsed:"ADMIN_SITE_MAPPING", factoryId, createdById:user.id});
    });
    return NextResponse.json({ok:true});
  } catch {
    return NextResponse.json({error:"Correspondance impossible : code/usine déjà affecté ou usine inactive. Aucune modification historique effectuée."},{status:409});
  }
}
