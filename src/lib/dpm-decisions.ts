import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { dpmAuditRecords, dpmCommitments, dpmCommitmentDecisions, dpmEventReviews, dpmEvents, dpmCalendars, dpmSiteSettings, orders } from "@/db/schema";
import { requireDpmCapability, type DpmCapability } from "./dpm-access";
import type { db } from "@/db";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const stepCapabilities: Record<string,DpmCapability> = {DECLARATION:"DECLARE",TECHNICAL:"TECHNICAL_REVIEW",IMPACT:"IMPACT_ANALYSIS",LOGISTICS:"LOGISTICS_REVIEW",INDUSTRIAL:"INDUSTRIAL_APPROVAL"};
export async function decideCommitment(tx: Tx, actorId:number, input:{commitmentId:number;factoryId:number;decision:"APPROVED"|"REJECTED";reason:string;proofDocumentId:number;requestKey:string}) {
  if (!input.reason?.trim() || !["APPROVED","REJECTED"].includes(input.decision)) throw new Error("Décision invalide");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(746201,1)`);
  await requireDpmCapability(tx,actorId,input.factoryId,"INDUSTRIAL_APPROVAL");
  const [submission] = await tx.select().from(dpmCommitments).where(eq(dpmCommitments.id,input.commitmentId)).for("update");
  if (!submission || submission.approvalFactoryId !== input.factoryId || submission.decision !== "PENDING") throw new Error("Soumission absente ou déjà définitive");
  const [decision] = await tx.insert(dpmCommitmentDecisions).values({...input,createdById:actorId}).returning();
  await tx.insert(dpmAuditRecords).values({entityType:"commitment_decision",entityId:String(decision.id),operation:"INSERT",reason:input.reason,requestKey:randomUUID(),afterData:decision,capabilityUsed:"INDUSTRIAL_APPROVAL",factoryId:input.factoryId,createdById:actorId});
  return decision;
}
export async function reviewEvent(tx:Tx, actorId:number, input:{eventId:number;eventVersion:number;step:string;decision:"APPROVED"|"PARTIAL"|"REJECTED";comment:string;evidenceSnapshot:number[]}) {
  if (!stepCapabilities[input.step] || !input.comment?.trim() || !["APPROVED","PARTIAL","REJECTED"].includes(input.decision) || !Array.isArray(input.evidenceSnapshot) || input.evidenceSnapshot.some(id=>!Number.isSafeInteger(id)||id<=0)) throw new Error("Revue invalide");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(746201,1)`);
  const [event] = await tx.select().from(dpmEvents).where(eq(dpmEvents.id,input.eventId)).for("update");
  if (!event || event.version!==input.eventVersion) throw new Error("Version événement invalide");
  await requireDpmCapability(tx,actorId,event.factoryId,stepCapabilities[input.step]);
  if (input.step==="INDUSTRIAL" && input.decision!=="REJECTED" && !input.evidenceSnapshot.length) throw new Error("Preuve obligatoire");
  const [review] = await tx.insert(dpmEventReviews).values({...input,createdById:actorId}).returning();
  await tx.insert(dpmAuditRecords).values({entityType:"event_review",entityId:String(review.id),operation:"INSERT",reason:input.comment,requestKey:randomUUID(),afterData:review,capabilityUsed:stepCapabilities[input.step],factoryId:event.factoryId,createdById:actorId});
  return review;
}
export async function publishCalendar(tx:Tx, actorId:number, calendarId:number, factoryId:number, reason:string) {
  if (!reason?.trim()) throw new Error("Justification obligatoire");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(746201,1)`);
  // A shared version requires explicit global CONFIGURE, not one site's grant.
  const grant = await tx.execute(sql`SELECT id FROM dpm_grants WHERE user_id=${actorId} AND capability='CONFIGURE' AND active AND factory_id IS NULL LIMIT 1`);
  if (!grant.rows.length) throw new Error("Habilitation globale CONFIGURE requise pour une version partagée");
  const [before] = await tx.select().from(dpmCalendars).where(eq(dpmCalendars.id,calendarId)).for("update");
  if (!before || before.publishedAt) throw new Error("Version absente ou publiée");
  const [after] = await tx.update(dpmCalendars).set({publishedAt:new Date().toISOString(),publishedById:actorId,publicationReason:reason}).where(and(eq(dpmCalendars.id,calendarId))).returning();
  await tx.insert(dpmAuditRecords).values({entityType:"calendar",entityId:String(calendarId),operation:"PUBLISH",reason,requestKey:randomUUID(),beforeData:before,afterData:after,capabilityUsed:"CONFIGURE",factoryId,createdById:actorId});
  return after;
}

export async function correctEvent(tx:Tx, actorId:number, previousId:number, input:{reference:string;detailedCause:string;reason:string;requestKey:string}) {
 if (!input.reference?.trim()||!input.detailedCause?.trim()||!input.reason?.trim())throw new Error("Correction motivée obligatoire");
 await tx.execute(sql`SELECT pg_advisory_xact_lock(746201,1)`);
 const [previous]=await tx.select().from(dpmEvents).where(eq(dpmEvents.id,previousId)).for("update");
 if(!previous)throw new Error("Événement absent");
 await requireDpmCapability(tx,actorId,previous.factoryId,"DECLARE");
 const {id:oldId,createdAt:oldDate,createdById:oldAuthor,...facts}=previous;
 void oldId; void oldDate; void oldAuthor;
 const [next]=await tx.insert(dpmEvents).values({...facts,reference:input.reference,detailedCause:input.detailedCause,requestKey:input.requestKey,correctionOfId:previousId,version:previous.version+1,createdById:actorId}).returning();
 await tx.insert(dpmAuditRecords).values({entityType:"event_correction",entityId:String(next.id),operation:"INSERT",reason:input.reason,requestKey:randomUUID(),beforeData:previous,afterData:next,capabilityUsed:"DECLARE",factoryId:next.factoryId,createdById:actorId});
 return next;
}


export async function submitCommitment(tx:Tx, actorId:number, input:{orderId:number;approvalFactoryId:number;previousId?:number;originalOrderDate:string;confirmedDueDate:string;calendarId:number;agreedItems:{itemId:number;quantity:number}[];reason:string;proofDocumentId?:number}) {
 if(!input.reason?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(input.originalOrderDate)||!/^\d{4}-\d{2}-\d{2}$/.test(input.confirmedDueDate))throw new Error("Soumission datée et motivée obligatoire");
 await tx.execute(sql`SELECT pg_advisory_xact_lock(746201,1)`);
 await requireDpmCapability(tx,actorId,input.approvalFactoryId,"DECLARE");
 const [site]=await tx.select().from(dpmSiteSettings).where(eq(dpmSiteSettings.factoryId,input.approvalFactoryId));
 if(!site)throw new Error("Site non rapproché");
 const [order]=await tx.select().from(orders).where(eq(orders.id,input.orderId)).for("no key update");
 if(!order)throw new Error("Commande absente");
 const [previous]=input.previousId?await tx.select().from(dpmCommitments).where(eq(dpmCommitments.id,input.previousId)).for("update"):[];
 if(input.previousId&&(!previous||previous.orderId!==input.orderId||previous.approvalFactoryId!==input.approvalFactoryId))throw new Error("Révision hors commande ou site");
 const [submission]=await tx.insert(dpmCommitments).values({...input,previousId:input.previousId??null,originalOrderDate:previous?.originalOrderDate??input.originalOrderDate,version:previous?previous.version+1:1,decision:"PENDING",createdById:actorId}).returning();
 await tx.insert(dpmAuditRecords).values({entityType:"commitment_submission",entityId:String(submission.id),operation:previous?"CORRECT":"SUBMIT",reason:input.reason,requestKey:randomUUID(),beforeData:previous??null,afterData:submission,capabilityUsed:"DECLARE",factoryId:input.approvalFactoryId,createdById:actorId});
 return submission;
}
