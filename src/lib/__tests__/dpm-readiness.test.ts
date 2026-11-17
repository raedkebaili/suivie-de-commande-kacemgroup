import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NextRequest } from 'next/server';
import { inspectDpmReadiness } from '../dpm-readiness';
import { createDpmDatabase } from './helpers/dpm-db';
const state=vi.hoisted(()=>({db:null as any,user:null as any}));
vi.mock('@/db',()=>({db:new Proxy({},{get:(_,key)=>{const v=state.db[key];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/auth',()=>({getUserFromHeaders:async()=>state.user}));
import { GET as report } from '@/app/api/dpm/performance/route';
import { GET as diagnostic } from '@/app/api/dpm/readiness/route';
describe('DPM deployment safety gate',()=>{
 let fixture:Awaited<ReturnType<typeof createDpmDatabase>>;
 const flag=process.env.DPM_ENABLED;
 beforeAll(async()=>{fixture=await createDpmDatabase();state.db=fixture.database;},60000);
 afterAll(async()=>{if(flag===undefined)delete process.env.DPM_ENABLED;else process.env.DPM_ENABLED=flag;await fixture.client.close();});
 it('pins the Vercel build to compilation only',()=>{
  expect(JSON.parse(readFileSync('vercel.json','utf8')).buildCommand).toBe('npm run build');
  expect(JSON.parse(readFileSync('package.json','utf8')).scripts.build).toBe('next build');
 });
 it('refuses a table-only schema, even when the audit table exists',async()=>{
  const db=new PGlite();try{await db.exec('CREATE TABLE dpm_audit_records(id serial PRIMARY KEY)');const result=await inspectDpmReadiness(drizzle(db) as never);expect(result.ready).toBe(false);expect(result.missingTables).not.toContain('dpm_audit_records');expect(result.missingTriggers).toContainEqual({table:'dpm_audit_records',trigger:'dpm_audit_no_update_delete'});}finally{await db.close();}
 });
 it('recognizes the complete explicit migration and detects a disabled protection',async()=>{
  expect((await inspectDpmReadiness(fixture.database as never)).ready).toBe(true);
  await fixture.client.exec('ALTER TABLE dpm_audit_records DISABLE TRIGGER dpm_audit_no_update_delete');
  expect((await inspectDpmReadiness(fixture.database as never)).ready).toBe(false);
 });
 it('refuses runtime activation with missing SQL protection and restricts diagnosis to admin',async()=>{
  process.env.DPM_ENABLED='true';state.user={id:1,role:'superadmin'};
  expect((await report(new NextRequest('http://localhost/api/dpm/performance'))).status).toBe(503);
  const response=await diagnostic(new NextRequest('http://localhost/api/dpm/readiness'));expect(response.status).toBe(200);expect((await response.json()).ready).toBe(false);
  state.user={id:1,role:'commercial'};expect((await diagnostic(new NextRequest('http://localhost/api/dpm/readiness'))).status).toBe(403);
 });
});
