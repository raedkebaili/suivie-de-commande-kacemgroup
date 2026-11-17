import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getTableName } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createDpmDatabase, seedLegacyTables, seedDpmTables } from "./helpers/dpm-db";
const state=vi.hoisted(()=>({db:null as any,failAt:0,inserts:0}));
vi.mock('@/db',()=>({db:new Proxy({}, {get:(_,key)=>{
 if(key==='transaction')return async(callback:any,options:any)=>state.db.transaction(async(tx:any)=>callback(new Proxy(tx,{get:(target,k)=>{
   if(k==='insert')return (table:any)=>{if(state.failAt && ++state.inserts===state.failAt)throw new Error('Simulated connection interruption');return target.insert(table);};
   const value=target[k];return typeof value==='function'?value.bind(target):value;
 }})),options);
 const value=state.db[key];return typeof value==='function'?value.bind(state.db):value;
}})}));
vi.mock('@/lib/auth',()=>({getUserFromHeaders:async()=>({id:11,role:'superadmin',username:'fixture',fullName:'Fixture'}),logActivity:async()=>{},hashPassword:async()=> 'test-reset-hash'}));
import { GET, POST } from '@/app/api/backup/route';
import { collectBackupData } from '../backup-data';
const request=(body?:unknown)=>new NextRequest('http://localhost/api/backup',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
const databases:Awaited<ReturnType<typeof createDpmDatabase>>[]=[];
async function fresh(){const d=await createDpmDatabase();databases.push(d);state.db=d.database;return d;}
describe('actual HTTP backup handlers / isolated PostgreSQL',()=>{
 let backup:any;
 beforeAll(async()=>{
  const source=await fresh();console.info("LEGACY MIGRATION DRIFT (test-only alignment):",source.legacyDrift);const {data}=await collectBackupData(source.database as never);
  await seedLegacyTables(source.database,Object.keys(data));await seedDpmTables(source.client);
  const res=await GET(request());expect(res.status).toBe(200);backup=await res.json();
  for(const [key,rows] of Object.entries(backup.data))expect((rows as unknown[]).length,`${key} must be non-empty`).toBeGreaterThan(0);
 },60000);
 afterAll(async()=>{for(const d of databases)await d.client.close();});
 it('restores all non-empty collections, relationships, quantities, documents, history and sequences',async()=>{
  const destination=await fresh();const res=await POST(request(backup));expect(res.status,await res.clone().text()).toBe(200);
  const restored=await collectBackupData(destination.database as never);
  // Password reset is the existing security contract, not a loss of business data.
  const expected=structuredClone(backup.data);for(const user of expected.users)user.mustChangePassword=true;
  for(const [key,rows] of Object.entries(restored.data)){
   const normalize=(list:any)=>[...list].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   expect(normalize(rows),key).toEqual(normalize(expected[key]));
  }
  for(const [key,rows] of Object.entries(backup.data)){
   const table=(schema as any)[key];if(!table||!(rows as any[]).some(r=>r.id))continue;
   const name=getTableName(table);const next=await destination.client.query<{id:number}>(`SELECT nextval(pg_get_serial_sequence('${name}','id'))::int AS id`);
   expect(next.rows[0].id,name).toBeGreaterThan(Math.max(...(rows as any[]).map(r=>r.id)));
  }
  expect((await POST(request(backup))).status).toBe(409);
 },60000);
 it('rolls back on invalid final DPM references, including all prior legacy inserts',async()=>{
  const destination=await fresh();const before=await collectBackupData(destination.database as never);const corrupted=structuredClone(backup);corrupted.data.dpmAuditRecords[0].createdById=999999;
  const res=await POST(request(corrupted));expect(res.status).toBe(500);
  expect(await collectBackupData(destination.database as never)).toEqual(before);
 },60000);
 it('rolls back an interruption after legacy data replacement has started',async()=>{
  const destination=await fresh();await destination.client.exec("INSERT INTO users(id,username,password_hash,full_name) VALUES(99,'sentinel','hash','Keep me')");
  state.failAt=12;state.inserts=0;
  try{expect((await POST(request(backup))).status).toBe(500);}finally{state.failAt=0;}
  expect((await destination.client.query('SELECT id,username FROM users')).rows).toEqual([{id:99,username:'sentinel'}]);
  expect((await destination.client.query('SELECT count(*)::int AS n FROM orders')).rows).toEqual([{n:0}]);
 },60000);
});
