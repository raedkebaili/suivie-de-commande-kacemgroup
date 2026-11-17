import { dpmOperationalReady } from "@/lib/dpm-readiness";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { users, dpmGrants, dpmSiteSettings, dpmAuditRecords } from "@/db/schema";
import { getUserFromHeaders } from "@/lib/auth";
import { DPM_CAPABILITIES } from "@/lib/dpm-access";
export const dynamic = "force-dynamic";
async function authorize(request:NextRequest) {
  if (process.env.DPM_CONFIGURATION_ENABLED!=="true") return NextResponse.json({error:"Module non activé"},{status:404});
  const actor=await getUserFromHeaders(request);
  return actor?.role==="superadmin" ? actor : NextResponse.json({error:"Accès refusé"},{status:403});
}
export async function GET(request:NextRequest) {
  const actor=await authorize(request); if (actor instanceof NextResponse) return actor;
  if (!await dpmOperationalReady(db)) return NextResponse.json({error:"Protections SQL DPM incomplètes ; opération refusée"},{status:503});
  return NextResponse.json({users:await db.select({id:users.id,fullName:users.fullName,active:users.active}).from(users),sites:await db.select().from(dpmSiteSettings),grants:await db.select().from(dpmGrants),capabilities:DPM_CAPABILITIES});
}
export async function POST(request:NextRequest) {
  const actor=await authorize(request); if (actor instanceof NextResponse) return actor;
  let body; try {body=await request.json();} catch {return NextResponse.json({error:"JSON invalide"},{status:400});}
  const {userId,factoryId,capability,active,reason}=body ?? {};
  if (!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(factoryId)||factoryId<=0||!DPM_CAPABILITIES.includes(capability)||typeof active!=="boolean"||typeof reason!=="string"||!reason.trim()||reason.length>2000) return NextResponse.json({error:"Habilitation invalide"},{status:400});
  try {
    if (!await dpmOperationalReady(db)) return NextResponse.json({error:"Protections SQL DPM incomplètes ; opération refusée"},{status:503});
    await db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(746201,1)`);
      const [account]=await tx.select().from(users).where(eq(users.id,userId)).for("update");
      const [site]=await tx.select().from(dpmSiteSettings).where(eq(dpmSiteSettings.factoryId,factoryId));
      if (!account?.active||!site) throw new Error("Utilisateur actif et site rapproché requis");
      const [before]=await tx.select().from(dpmGrants).where(and(eq(dpmGrants.userId,userId),eq(dpmGrants.factoryId,factoryId),eq(dpmGrants.capability,capability))).for("update");
      const [after]=before ? await tx.update(dpmGrants).set({active}).where(eq(dpmGrants.id,before.id)).returning() : await tx.insert(dpmGrants).values({userId,factoryId,capability,active,createdById:actor.id}).returning();
      await tx.insert(dpmAuditRecords).values({entityType:"grant",entityId:String(after.id),operation:active?"GRANT":"REVOKE",reason,requestKey:randomUUID(),beforeData:before??null,afterData:after,capabilityUsed:"ADMIN_GRANTS",factoryId,createdById:actor.id});
    });
    return NextResponse.json({ok:true});
  } catch {return NextResponse.json({error:"Attribution impossible ; aucune modification enregistrée"},{status:409});}
}
