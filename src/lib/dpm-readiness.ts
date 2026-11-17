import { sql, getTableName } from 'drizzle-orm';
import type { db } from '@/db';
import { dpmBackupTables } from './dpm-backup';
import requiredTriggers from './dpm-required-triggers.json';
type Executor=Pick<typeof db,'execute'>;
/** READ ONLY minimum safety gate, not a migration runner or full certification.
 * ORM schema synchronization creates tables but does not install SQL triggers.
 * Never treat to_regclass(audit_table) alone as proof of readiness.
 */
export async function inspectDpmReadiness(tx:Executor){
 const tables=Object.values(dpmBackupTables).map(getTableName);
 const expected=sql.join(requiredTriggers.map(t=>sql`(${t.table},${t.name},${t.function})`),sql`, `);
 const missingTables=await tx.execute(sql`SELECT name FROM unnest(ARRAY[${sql.join(tables.map(t=>sql`${t}`),sql`, `)}]::text[]) AS name WHERE to_regclass('public.' || name) IS NULL ORDER BY name`);
 const missingTriggers=await tx.execute(sql`WITH required(table_name,trigger_name,function_name) AS (VALUES ${expected})
 SELECT r.table_name,r.trigger_name FROM required r WHERE NOT EXISTS(
 SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE n.nspname='public' AND c.relname=r.table_name AND t.tgname=r.trigger_name AND p.proname=r.function_name AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal) ORDER BY r.table_name,r.trigger_name`);
 return {ready:missingTables.rows.length===0&&missingTriggers.rows.length===0,missingTables:missingTables.rows.map(r=>String(r.name)),missingTriggers:missingTriggers.rows.map(r=>({table:String(r.table_name),trigger:String(r.trigger_name)})),notice:'Contrôle minimal en lecture seule. Ne certifie ni sauvegarde, ni migration complète, ni intégrité historique.'};
}
export async function dpmOperationalReady(tx:Executor){try{return (await inspectDpmReadiness(tx)).ready;}catch{return false;}}
