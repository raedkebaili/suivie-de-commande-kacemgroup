import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { PgDialect, getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { SQL, getTableName } from "drizzle-orm";
import * as schema from "@/db/schema";
export async function createDpmDatabase() {
 const client=new PGlite();
 for(const file of readdirSync('drizzle').filter(f=>/^000[0-7]_.*\.sql$/.test(f)).sort())await client.exec(readFileSync(`drizzle/${file}`,'utf8'));
 // Explicit compatibility fixture: historical schema drift is reported, NOT
 // repaired in migration 0007 or on any real DB.
 const legacyDrift:string[]=[];const dialect=new PgDialect();
 for(const table of Object.values(schema)){
  const config=getTableConfig(table);if(config.name.startsWith('dpm_'))continue;
  const existing=await client.query<{column_name:string}>(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,[config.name]);
  if(!existing.rows.length)throw new Error(`Missing legacy table ${config.name}`);
  for(const col of config.columns){
   if(existing.rows.some(r=>r.column_name===col.name))continue;
   legacyDrift.push(`${config.name}.${col.name}`);
   let def='';if(col.default!==undefined)def=` DEFAULT ${col.default instanceof SQL?dialect.sqlToQuery(col.default).sql:typeof col.default==='string'?"'"+col.default.replaceAll("'","''")+"'":String(col.default)}`;
   await client.exec(`ALTER TABLE "${config.name}" ADD COLUMN "${col.name}" ${col.getSQLType()}${def}${col.notNull?' NOT NULL':''}`);
  }
 }
 if(legacyDrift.includes('photometric_study_items.order_item_id'))await client.exec('ALTER TABLE photometric_study_items ADD CONSTRAINT fixture_photometric_order_item_fk FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE SET NULL');
 return {client,database:drizzle(client),legacyDrift};
}
// Non-empty synthetic fixture of ALL exported legacy tables. Values are test
// markers, not a representative anonymized production dataset.
export async function seedLegacyTables(database:ReturnType<typeof drizzle>,keys:string[]){
 const tables=keys.filter(k=>!k.startsWith('dpm')).map(k=>(schema as unknown as Record<string,PgTable>)[k]);
 const pending=new Set(tables);const done=new Set<string>();
 while(pending.size){
  let progress=false;
  for(const table of pending){
   const config=getTableConfig(table);
   const refs=new Map(config.foreignKeys.flatMap(f=>{const r=f.reference();return r.columns.map(c=>[c.name,{table:getTableName(r.foreignTable),column:r.foreignColumns[0].name}] as const);}));
   if([...refs.values()].some(r=>!done.has(r.table)&&r.table!==config.name&&tables.some(t=>getTableName(t)===r.table)))continue;
   const values:Record<string,unknown>={};
   for(const col of config.columns){
    if(col.name==='id'){values[col.name]=11;continue;}
    if(refs.has(col.name)){values[col.name]=11;continue;}
    if(col.default!==undefined && !(col.default instanceof SQL)){values[col.name]=col.default;continue;}
    if(!col.notNull||col.default!==undefined)continue;
    const type=col.getSQLType();
    values[col.name]=type.includes('int')||type.includes('double')?4:type==='boolean'?false:type.includes('timestamp')?'2026-10-15T08:00:00Z':`${config.name}_${col.name}`;
   }
   const columns=Object.keys(values);const params=columns.map((_,i)=>`$${i+1}`).join(',');
   await database.$client.query(`INSERT INTO "${config.name}" (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${params}) ON CONFLICT DO NOTHING`,Object.values(values));
   done.add(config.name);pending.delete(table);progress=true;
  }
  if(!progress)throw new Error(`Fixture cycle: ${[...pending].map(getTableName)}`);
 }
}
export async function seedDpmTables(client:PGlite){
 await client.exec(`
 UPDATE order_items SET quantity=4,produced_qty=4,delivered_qty=4 WHERE id=11;
 INSERT INTO factories(id,code,name) VALUES(12,'fixture-second','Fixture second');
 INSERT INTO dpm_calendars(id,calendar_key,version,name,effective_from,working_intervals,created_by_id) VALUES(11,'fixture',1,'Synthetic only','2026-01-01','{"1":[{"start":"08:00","end":"12:00"}],"2":[{"start":"08:00","end":"12:00"}],"3":[{"start":"08:00","end":"12:00"}],"4":[{"start":"08:00","end":"12:00"}],"5":[{"start":"08:00","end":"12:00"}],"6":[{"start":"08:00","end":"12:00"}]}',11);
 INSERT INTO dpm_calendar_days(id,calendar_id,day,working,reason,source,validated_by_id,validated_at,created_by_id) VALUES(11,11,'2026-10-19',false,'Synthetic exception','Test fixture',11,'2026-10-01T08:00Z',11);
 UPDATE dpm_calendars SET published_at='2026-10-01T08:00Z',published_by_id=11,publication_reason='Synthetic publication' WHERE id=11;
 INSERT INTO dpm_site_settings(id,factory_id,reporting_code,region_code,calendar_id,created_by_id) VALUES(11,11,'KER-01','KER',11,11);
 INSERT INTO dpm_grants(id,user_id,factory_id,capability,created_by_id) VALUES(11,11,11,'INDUSTRIAL_APPROVAL',11);
 INSERT INTO dpm_commitments(id,order_id,approval_factory_id,version,original_order_date,confirmed_due_date,calendar_id,agreed_items,reason,created_by_id) VALUES(11,11,11,1,'2026-10-01','2026-10-20',11,'[{"itemId":11,"quantity":4}]','Fixture submitted',11);
 INSERT INTO dpm_commitment_decisions(id,commitment_id,factory_id,decision,reason,proof_document_id,request_key,created_by_id) VALUES(11,11,11,'APPROVED','Fixture decision',11,'11111111-1111-4111-8111-111111111111',11);
 INSERT INTO dpm_deliveries(id,order_id,number,dispatch_factory_id,request_key,created_by_id) VALUES(11,11,'Fixture BL',11,'11111111-1111-4111-8111-111111111112',11);
 INSERT INTO dpm_delivery_lines(id,delivery_id,item_id,manufacturing_factory_id,commitment_id,planned_qty,due_date,created_by_id) VALUES(11,11,11,11,11,4,'2026-10-20',11);
 INSERT INTO dpm_delivery_movements(id,line_id,batch_id,created_by_id) VALUES(11,11,11,11);
 INSERT INTO dpm_receipts(id,line_id,reference,received_at,received_qty,accepted_qty,status,proof_document_id,validated_by_id,validated_at,request_key,created_by_id) VALUES(11,11,'Fixture receipt','2026-10-20T08:00Z',4,4,'ACCEPTED',11,11,'2026-10-20T08:00Z','11111111-1111-4111-8111-111111111113',11);
 INSERT INTO dpm_events(id,reference,factory_id,origin,category,starts_at,resource_key,detailed_cause,request_key,created_by_id) VALUES(11,'Fixture event',11,'EXTERNAL','Fixture cause','2026-10-15T08:00Z','Fixture line','Test only','11111111-1111-4111-8111-111111111114',11);
 `);
 for(const [index,step] of ['DECLARATION','TECHNICAL','IMPACT','LOGISTICS','INDUSTRIAL'].entries())await client.query(`INSERT INTO dpm_event_reviews(id,event_id,event_version,step,decision,comment,evidence_snapshot,created_by_id) VALUES($1,11,1,$2,'APPROVED','Synthetic review','[11]',11)`,[11+index,step]);
 await client.exec(`
 INSERT INTO dpm_event_impacts(id,event_id,event_version,order_id,commitment_id,critical_path_key,starts_at,ends_at,demonstrated_impact,claimed_minutes,admissible_minutes,decision,validator_comment,proof_document_id,validated_by_id,validated_at,created_by_id) VALUES(11,11,1,11,11,'Fixture path','2026-10-15T08:00Z','2026-10-15T09:00Z','Synthetic impact',60,60,'APPROVED','Synthetic decision',11,11,'2026-10-15T10:00Z',11);
 INSERT INTO dpm_milestones(id,order_id,reference,kind,step_code,factory_id,destination_factory_id,calendar_id,due_at,actual_at,proof_document_id,created_by_id) VALUES(11,11,'Fixture transfer','TRANSFER','TRANSFER',11,12,11,'2026-10-20T08:00Z','2026-10-20T08:00Z',11,11);
 INSERT INTO dpm_corrective_actions(id,order_id,event_id,factory_id,category_5m,root_cause,action,owner_id,due_date,created_by_id) VALUES(11,11,11,11,'METHODS','Fixture cause','Fixture action',11,'2026-10-21',11);
 INSERT INTO dpm_audit_records(id,entity_type,entity_id,operation,reason,request_key,capability_used,factory_id,created_by_id) VALUES(11,'fixture','11','INSERT','Synthetic history','11111111-1111-4111-8111-111111111115','CONFIGURE',11,11);
 `);
}
