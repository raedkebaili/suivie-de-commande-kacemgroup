import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDpmDatabase, seedLegacyTables, seedDpmTables } from "./helpers/dpm-db";
const state=vi.hoisted(()=>({db:null as any,user:{id:11,role:'superadmin',username:'fixture',fullName:'Fixture'},files:new Map<string,{parents:string[];trashed?:boolean}>(),deleted:[] as string[]}));
vi.mock('@/db',()=>({db:new Proxy({},{get:(_,key)=>{const v=state.db[key];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/auth',()=>({getUserFromHeaders:async()=>state.user,logActivity:async()=>{}}));
vi.mock('@/lib/google-drive',()=>({
 assertInsideRoot:async()=>true,
 FOLDER_MIME:'application/vnd.google-apps.folder',ensureRootFolder:async()=>({id:'root',name:'Root'}),updateConfig:async()=>{},
 friendlyDriveError:(e:Error)=>({message:e.message,status:500}),
 getDriveClient:async()=>({cfg:{rootFolderId:'root'},drive:{files:{
   list:async()=>({data:{files:[...state.files.keys()].map(id=>({id,name:id,parents:state.files.get(id)?.parents}))}}),
   get:async({fileId}:{fileId:string})=>{const f=state.files.get(fileId);if(!f)throw new Error('404');return {data:{id:fileId,name:fileId,...f}};},
   delete:async({fileId}:{fileId:string})=>{state.deleted.push(fileId);return {data:{}};},
 }}}),
}));
import { collectBackupData } from '../backup-data';
import { decideCommitment, publishCalendar, correctEvent, reviewEvent, submitCommitment } from '../dpm-decisions';
import { orderDpmBackupRows } from '../dpm-backup';
import { requireDpmCapability } from '../dpm-access';
import { verifyDpmDriveFiles, canReadDpmProofFile } from '../dpm-proofs';
import { POST as grant } from '@/app/api/dpm/grants/route';
import { GET as listFiles } from '@/app/api/storage/files/route';
import { GET as downloadFile } from '@/app/api/storage/download/[id]/route';
import { DELETE as deleteFile } from '@/app/api/storage/files/[id]/route';
const req=(body?:unknown)=>new NextRequest('http://localhost/api/dpm/grants',body?{method:'POST',body:JSON.stringify(body)}:undefined);
describe('DPM lifecycle and targeted physical proof protection',()=>{
 let source:Awaited<ReturnType<typeof createDpmDatabase>>;
 const previous=process.env.DPM_CONFIGURATION_ENABLED;
 beforeAll(async()=>{
  source=await createDpmDatabase();state.db=source.database;
  const {data}=await collectBackupData(source.database as never);await seedLegacyTables(source.database,Object.keys(data));await seedDpmTables(source.client);
  await source.client.exec(`INSERT INTO users(id,username,password_hash,full_name) VALUES(12,'second','hash','Second');
  INSERT INTO factories(id,code,name) VALUES(13,'fixture-3','Fixture 3'),(14,'fixture-4','Fixture 4');
  INSERT INTO dpm_site_settings(factory_id,reporting_code,region_code,created_by_id) VALUES(12,'KER-02','KER',11),(13,'AGU-01','AGU',11),(14,'AGU-02','AGU',11);`);
  state.files.set('drive_documents_drive_file_id',{parents:['proof-folder']});state.files.set('proof-folder',{parents:['root']});state.files.set('root',{parents:[]});state.files.set('ordinary',{parents:['root']});
 },60000);
 afterAll(async()=>{if(previous===undefined)delete process.env.DPM_CONFIGURATION_ENABLED;else process.env.DPM_CONFIGURATION_ENABLED=previous;await source.client.close();});
 it('assigns/revokes only as superadmin, audits changes and isolates all four sites',async()=>{
  process.env.DPM_CONFIGURATION_ENABLED='true';
  const input={userId:12,factoryId:12,capability:'READ',active:true,reason:'Fixture grant'};
  state.user={...state.user,role:'commercial'};expect((await grant(req(input))).status).toBe(403);
  state.user={...state.user,role:'superadmin'};
  expect((await grant(req({...input,factoryId:999}))).status).toBe(409);
  expect((await grant(req(input))).status).toBe(200);
  await expect(requireDpmCapability(source.database as never,12,12,'READ')).resolves.toBeUndefined();
  for(const site of [11,13,14])await expect(requireDpmCapability(source.database as never,12,site,'READ')).rejects.toThrow();
  await expect(requireDpmCapability(source.database as never,12,12,'INDUSTRIAL_APPROVAL')).rejects.toThrow();
  expect((await grant(req({...input,active:false,reason:'Fixture revoke'}))).status).toBe(200);
  await expect(requireDpmCapability(source.database as never,12,12,'READ')).rejects.toThrow();
  expect((await source.client.query("SELECT operation FROM dpm_audit_records WHERE entity_type='grant' ORDER BY id")).rows).toEqual([{operation:'GRANT'},{operation:'REVOKE'}]);
 });
 it('serializes two competing terminal decisions without modifying a submission',async()=>{
  await source.client.exec(`INSERT INTO dpm_grants(user_id,factory_id,capability,created_by_id) VALUES(12,11,'INDUSTRIAL_APPROVAL',11);
  INSERT INTO dpm_commitments(id,order_id,approval_factory_id,version,previous_id,original_order_date,confirmed_due_date,calendar_id,agreed_items,reason,created_by_id) SELECT 21,order_id,11,2,id,original_order_date,confirmed_due_date,calendar_id,agreed_items,'Correction submitted',11 FROM dpm_commitments WHERE id=11;`);
  const outcomes=await Promise.allSettled([11,12].map((actor,index)=>source.database.transaction(tx=>decideCommitment(tx as never,actor,{commitmentId:21,factoryId:11,decision:index?'REJECTED':'APPROVED',reason:'Competing review',proofDocumentId:11,requestKey:`22222222-2222-4222-8222-22222222222${index}`}))));
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await source.client.query("SELECT decision FROM dpm_commitments WHERE id=21")).rows).toEqual([{decision:'PENDING'}]);
  await expect(source.client.exec("UPDATE dpm_commitment_decisions SET decision='REJECTED' WHERE commitment_id=21")).rejects.toThrow('immutable');
 });
 it('adds event corrections and rejects cross-function reviews without overwriting old decisions',async()=>{
  await source.client.exec("INSERT INTO dpm_grants(user_id,factory_id,capability,created_by_id) VALUES(12,11,'DECLARE',11)");
  const next=await source.database.transaction(tx=>correctEvent(tx as never,12,11,{reference:'corrected-event',detailedCause:'Corrected explanation',reason:'Evidence updated',requestKey:'22222222-2222-4222-8222-222222222223'}));
  expect(next.version).toBe(2);expect(next.correctionOfId).toBe(11);
  await expect(source.database.transaction(tx=>reviewEvent(tx as never,12,{eventId:next.id,eventVersion:2,step:'TECHNICAL',decision:'APPROVED',comment:'Not my function',evidenceSnapshot:[11]}))).rejects.toThrow();
  expect((await source.client.query('SELECT count(*)::int AS n FROM dpm_event_reviews WHERE event_id=11')).rows).toEqual([{n:5}]);
 });
 it('submits a correction append-only and preserves the immutable initial date',async()=>{
  const correction=await source.database.transaction(tx=>submitCommitment(tx as never,12,{orderId:11,approvalFactoryId:11,previousId:21,originalOrderDate:'2020-01-01',confirmedDueDate:'2026-10-22',calendarId:11,agreedItems:[{itemId:11,quantity:4}],reason:'Client correction'}));
  expect(correction.version).toBe(3);expect(correction.originalOrderDate).toBe('2026-10-01');
  expect(correction.createdById).toBe(12);expect(correction.previousId).toBe(21);
 });
 it('orders restoration by dependencies rather than ids and refuses cycles',()=>{
  expect(orderDpmBackupRows('dpmCommitments',[{id:1,previousId:21},{id:21,previousId:11},{id:11,previousId:null}]).map(r=>r.id)).toEqual([11,21,1]);
  expect(()=>orderDpmBackupRows('dpmReceipts',[{id:1,correctionOfId:2},{id:2,correctionOfId:1}])).toThrow('cycliques');
 });
 it('publishes explicit calendar hours once, freezes exceptions and records the actor/reason',async()=>{
  await source.client.exec(`INSERT INTO dpm_calendars(id,calendar_key,version,name,working_weekdays,working_intervals,effective_from,created_by_id) VALUES(21,'fixture',2,'Next explicit version','[1]','{"1":[{"start":"09:00","end":"10:00"}]}','2027-01-01',11)`);
  await expect(source.database.transaction(tx=>publishCalendar(tx as never,11,21,11,'Reviewed'))).rejects.toThrow('globale');
  await source.client.exec("INSERT INTO dpm_grants(user_id,capability,created_by_id) VALUES(11,'CONFIGURE',11)");
  await source.database.transaction(tx=>publishCalendar(tx as never,11,21,11,'Reviewed synthetic calendar'));
  await expect(source.client.exec("UPDATE dpm_calendars SET name='rewrite' WHERE id=21")).rejects.toThrow('immutable');
  await expect(source.client.exec("INSERT INTO dpm_calendar_days(calendar_id,day,working,reason,source,created_by_id) VALUES(21,'2027-01-04',false,'late change','fixture',11)")).rejects.toThrow('immutable');
  await expect(source.client.exec("DELETE FROM dpm_calendar_days WHERE calendar_id=11")).rejects.toThrow('immutable');
  expect((await source.client.query("SELECT created_by_id,reason FROM dpm_audit_records WHERE operation='PUBLISH'")).rows).toEqual([{created_by_id:11,reason:'Reviewed synthetic calendar'}]);
 });
 it('simulates physical deletes: protects proof and ancestor, permits unrelated files',async()=>{
  for(const id of ['drive_documents_drive_file_id','proof-folder'])expect((await deleteFile(req(),{params:Promise.resolve({id})})).status).toBe(409);
  expect((await deleteFile(req(),{params:Promise.resolve({id:'ordinary'})})).status).toBe(200);
  expect(state.deleted).toEqual(['ordinary']);
  expect(await canReadDpmProofFile('drive_documents_drive_file_id',12,source.database as never)).toBe(false);
 });
 it('filters protected metadata and rejects unauthorized downloads before reading Drive content',async()=>{
  state.user={...state.user,id:12};
  try{
   const response=await listFiles(new NextRequest('http://localhost/api/storage/files?q=fixture'));
   expect(response.status).toBe(200);const body=await response.json();
   expect(body.files.map((f:{id:string})=>f.id)).not.toContain('drive_documents_drive_file_id');
   expect(body.files.map((f:{id:string})=>f.id)).toContain('ordinary');
   expect((await downloadFile(req(),{params:Promise.resolve({id:'drive_documents_drive_file_id'})})).status).toBe(403);
  }finally{state.user={...state.user,id:11};}
 });
 it('verifies Drive existence through a simulated adapter and distinguishes missing/inaccessible files',async()=>{
  const read=async(id:string)=>{const file=state.files.get(id);if(!file)throw new Error('404');return file;};
  expect((await verifyDpmDriveFiles(read,source.database as never))[0].status).toBe('present');
  state.files.delete('drive_documents_drive_file_id');
  expect((await verifyDpmDriveFiles(read,source.database as never))[0].status).toBe('missing_or_inaccessible');
 });
});
