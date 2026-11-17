/** READ ONLY. Run against an isolated anonymized copy, never production.
 * Snapshot: DPM_REHEARSAL_ACK=ISOLATED_ANONYMIZED_COPY \
 * DPM_REHEARSAL_DATABASE_URL=... node scripts/dpm-rehearsal-audit.mjs snapshot backups/dpm-before.json
 * Compare: node scripts/dpm-rehearsal-audit.mjs compare backups/dpm-before.json backups/dpm-after.json
 * No data rows, URLs, passwords or tokens are printed or written.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import pg from 'pg';
const [command, first, second] = process.argv.slice(2);
const quote = value => '"' + value.replaceAll('"','""') + '"';
if(command==='compare'){
 const before=JSON.parse(await readFile(first,'utf8')), after=JSON.parse(await readFile(second,'utf8'));
 const changed=[];
 for(const table of before.tables){
  if(table.name.startsWith('dpm_')||table.name==='__drizzle_migrations')continue;
  const next=after.tables.find(t=>t.schema===table.schema&&t.name===table.name);
  if(!next||next.count!==table.count||next.digest!==table.digest)changed.push(`${table.schema}.${table.name}`);
 }
 const sequenceChanges=before.sequences.filter(old=>{const next=after.sequences.find(s=>s.schemaname===old.schemaname&&s.sequencename===old.sequencename);return !next||String(next.last_value)!==String(old.last_value);}).map(s=>`${s.schemaname}.${s.sequencename}`);
 const legacyConstraintChanges=before.constraints.filter(old=>!after.constraints.some(c=>c.schema===old.schema&&c.table_name===old.table_name&&c.conname===old.conname&&c.definition===old.definition)).map(c=>c.conname);
 const requiredConstraints=['dpm_commitments_version_ck','dpm_pending_approval_site_ck','dpm_calendar_publication_ck','dpm_receipts_quantity_ck','dpm_event_impacts_duration_ck'];
 const missingConstraints=requiredConstraints.filter(name=>!after.constraints.some(c=>c.conname===name));
 const nonEmptyDpm=after.tables.filter(t=>t.name.startsWith('dpm_')&&Number(t.count)>0).map(t=>t.name);
 const required=['dpm_audit_no_update_delete','dpm_audit_no_truncate','dpm_commitments_immutable','dpm_decisions_immutable','dpm_calendar_freeze','dpm_calendar_day_freeze','dpm_document_protection','dpm_impact_consistency'];
 const missingTriggers=required.filter(name=>!after.triggers.some(t=>t.tgname===name&&t.tgenabled!=='D'));
 const expectedColumns=[['order_items','reference'],['photometric_study_items','order_item_id']];
 const missingLegacyColumns=expectedColumns.filter(([table,column])=>!after.columns.some(c=>c.table_name===table&&c.column_name===column)).map(v=>v.join('.'));
 console.log(JSON.stringify({unchangedLegacyData:changed.length===0,changedLegacyTables:changed,sequenceChanges,legacyConstraintChanges,missingConstraints,nonEmptyDpmAfterMigration:nonEmptyDpm,missingTriggers,missingLegacyColumns,notice:'This comparison is not deployment approval. Review all constraints, sequences, permissions, HTTP recovery and Drive results.'},null,2));
 if(changed.length||sequenceChanges.length||legacyConstraintChanges.length||missingConstraints.length||nonEmptyDpm.length||missingTriggers.length||missingLegacyColumns.length)process.exitCode=1;
}else if(command==='snapshot'&&first){
 if(process.env.DPM_REHEARSAL_ACK!=='ISOLATED_ANONYMIZED_COPY'||!process.env.DPM_REHEARSAL_DATABASE_URL)throw new Error('Explicit isolated-copy acknowledgement and separate connection variable required');
 const client=new pg.Client({connectionString:process.env.DPM_REHEARSAL_DATABASE_URL});
 try{
  await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL TIME ZONE 'UTC'");
  const tables=[];
  const names=await client.query("SELECT schemaname AS schema,tablename AS name FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname !~ '^pg_' ORDER BY schemaname,tablename");
  for(const table of names.rows){
   const name=`${quote(table.schema)}.${quote(table.name)}`;
   const {rows}=await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM ${name} t`);
   tables.push({...table,...rows[0]});
  }
  const {rows:columns}=await client.query("SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name,ordinal_position");
  const {rows:constraints}=await client.query("SELECT n.nspname AS schema,c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,k.conname");
  const {rows:triggers}=await client.query("SELECT c.relname AS table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal ORDER BY c.relname,t.tgname");
  const {rows:sequences}=await client.query("SELECT schemaname,sequencename,start_value,last_value FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname !~ '^pg_' ORDER BY schemaname,sequencename");
  const {rows:functions}=await client.query("SELECT n.nspname AS schema,p.proname,md5(pg_get_functiondef(p.oid)) AS digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'dpm_%' AND p.prokind='f' ORDER BY n.nspname,p.proname");
  await client.query('COMMIT');await mkdir(dirname(first),{recursive:true});await writeFile(first,JSON.stringify({capturedAt:new Date().toISOString(),tables,columns,constraints,triggers,sequences,functions},null,2),{mode:0o600});
  console.log(`Read-only snapshot saved: ${first}`);
 }finally{await client.end();}
}else{
 console.error('Usage: snapshot <output.json> | compare <before.json> <after.json>');process.exitCode=2;
}
