import { eq, getTableName, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { db } from "@/db";

// Dependency order. Audit is inserted, never deleted or overwritten.
export const dpmBackupTables = {
  dpmCalendars: schema.dpmCalendars, dpmCalendarDays: schema.dpmCalendarDays,
  dpmSiteSettings: schema.dpmSiteSettings, dpmGrants: schema.dpmGrants,
  dpmCommitments: schema.dpmCommitments, dpmCommitmentDecisions: schema.dpmCommitmentDecisions, dpmDeliveries: schema.dpmDeliveries,
  dpmDeliveryLines: schema.dpmDeliveryLines, dpmDeliveryMovements: schema.dpmDeliveryMovements,
  dpmReceipts: schema.dpmReceipts, dpmEvents: schema.dpmEvents,
  dpmEventReviews: schema.dpmEventReviews, dpmEventImpacts: schema.dpmEventImpacts,
  dpmMilestones: schema.dpmMilestones, dpmCorrectiveActions: schema.dpmCorrectiveActions,
  dpmAuditRecords: schema.dpmAuditRecords,
};
type Executor = Pick<typeof db, "select" | "execute" | "insert" | "update">;
export class DpmRestoreConflict extends Error {}
export async function dpmSchemaAvailable(tx: Pick<Executor, "execute">) {
  const result = await tx.execute(sql`SELECT to_regclass('public.dpm_audit_records') AS name`);
  return Boolean(result.rows[0]?.name);
}
export async function collectDpmBackup(tx: Pick<Executor, "select" | "execute">) {
  if (!await dpmSchemaAvailable(tx)) return {};
  const result: Record<string, unknown[]> = {};
  for (const [key, table] of Object.entries(dpmBackupTables)) result[key] = await tx.select().from(table);
  return result;
}
// The existing restore replaces legacy parents. It must NOT be allowed to
// erase facts or audit in a populated DPM destination. Recovery uses a fresh DB.
export async function assertDpmRestoreSafe(tx: Executor, data: Record<string, unknown>) {
  const available = await dpmSchemaAvailable(tx);
  const keys = Object.keys(dpmBackupTables);
  const supplied = keys.some(key => Object.hasOwn(data, key));
  if (supplied && (!available || keys.some(key => !Array.isArray(data[key])))) {
    throw new DpmRestoreConflict("Sauvegarde DPM incomplète ou migration DPM absente : restauration refusée.");
  }
  if (!available) return;
  for (const table of Object.values(dpmBackupTables)) {
    if ((await tx.select().from(table).limit(1)).length) {
      throw new DpmRestoreConflict("Destination DPM non vide : restaurer vers une base de récupération vide pour conserver tout l'historique.");
    }
  }
}
export function orderDpmBackupRows<T extends Record<string,unknown>>(key:string,rows:T[]) {
  const parentKey=key==='dpmCommitments'?'previousId':['dpmEvents','dpmReceipts'].includes(key)?'correctionOfId':null;
  const pending=[...rows].sort((a,b)=>Number(a.id)-Number(b.id));
  if(key==='dpmEventReviews'){
    const rank=['DECLARATION','TECHNICAL','IMPACT','LOGISTICS','INDUSTRIAL'];
    return pending.sort((a,b)=>Number(a.eventId)-Number(b.eventId)||Number(a.eventVersion)-Number(b.eventVersion)||rank.indexOf(String(a.step))-rank.indexOf(String(b.step)));
  }
  if(!parentKey)return pending;
  const ordered:typeof pending=[];const inserted=new Set<unknown>();
  while(pending.length){
    const index=pending.findIndex(row=>row[parentKey]==null||inserted.has(row[parentKey]));
    if(index<0)throw new DpmRestoreConflict(`Références cycliques ou manquantes dans ${key}`);
    const [row]=pending.splice(index,1);ordered.push(row);inserted.add(row.id);
  }
  return ordered;
}
export async function restoreDpmBackup(tx: Executor, data: Record<string, unknown>) {
  let count = 0;
  const publications: (typeof schema.dpmCalendars.$inferInsert)[] = [];
  for (const [key, table] of Object.entries(dpmBackupTables)) {
    const rows = data[key];
    if (!Array.isArray(rows)) continue;
    // Dependency ordering, not id ordering: imported corrections may have lower ids.
    const sorted = orderDpmBackupRows(key,rows);
    for (const row of sorted) {
      if (key === "dpmCalendars" && row.publishedAt) {
        publications.push(row);
        await tx.insert(table).values({...row,publishedAt:null,publishedById:null,publicationReason:null});
      } else await tx.insert(table).values(row);
    }
    if (key === "dpmCalendarDays") {
      for (const row of publications) await tx.update(schema.dpmCalendars).set({publishedAt:row.publishedAt,publishedById:row.publishedById,publicationReason:row.publicationReason}).where(eq(schema.dpmCalendars.id,row.id!));
    }
    const name = getTableName(table);
    await tx.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('${name}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM "${name}"),1),COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='${name}_id_seq'),1)),true)`));
    count += rows.length;
  }
  return count;
}
