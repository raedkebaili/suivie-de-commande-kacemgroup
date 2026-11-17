import { beforeAll,afterAll,it,expect,vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createDpmDatabase,seedLegacyTables,seedDpmTables } from './helpers/dpm-db';
const state=vi.hoisted(()=>({db:null as any,user:null as any}));
vi.mock('@/db',()=>({db:new Proxy({},{get:(_,key)=>{const v=state.db[key];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/auth',()=>({getUserFromHeaders:async()=>state.user}));
import { collectBackupData } from '../backup-data';
import { GET } from '@/app/api/dpm/performance/route';
let fixture:Awaited<ReturnType<typeof createDpmDatabase>>;
const previous=process.env.DPM_ENABLED;
const request=()=>new NextRequest('http://localhost/api/dpm/performance?from=2026-10-01&to=2026-10-20');
beforeAll(async()=>{fixture=await createDpmDatabase();state.db=fixture.database;const {data}=await collectBackupData(fixture.database as never);await seedLegacyTables(fixture.database,Object.keys(data));await seedDpmTables(fixture.client);},60000);
afterAll(async()=>{if(previous===undefined)delete process.env.DPM_ENABLED;else process.env.DPM_ENABLED=previous;await fixture.client.close();});
it('closed by default and refuses unauthenticated and implicit-role access',async()=>{
 delete process.env.DPM_ENABLED;expect((await GET(request())).status).toBe(503);
 process.env.DPM_ENABLED='true';expect((await GET(request())).status).toBe(401);
 state.user={id:11,role:'superadmin',username:'fixture',fullName:'Fixture',darkMode:false};
 expect((await GET(request())).status).toBe(403);
});
it('calculates from real PostgreSQL commitments, signed shipments and accepted receipts',async()=>{
 await fixture.client.exec("INSERT INTO dpm_grants(user_id,capability,created_by_id) VALUES(11,'READ',11)");
 const response=await GET(request());expect(response.status).toBe(200);const report=await response.json();
 expect(report.rows).toHaveLength(1);expect(report.rows[0].completion).toBe('2026-10-20');expect(report.rows[0].items[0].accepted).toBe(4);expect(report.kpis.OTIF).toBe(100);expect(report.kpis.eligible).toBe(1);
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it('rejects invalid periods and discloses no order for a different granted site',async()=>{
 expect((await GET(new NextRequest('http://localhost/api/dpm/performance?to=2026-02-30'))).status).toBe(400);
 await fixture.client.exec("INSERT INTO users(id,username,password_hash,full_name) VALUES(12,'limited','hash','Limited');INSERT INTO dpm_grants(user_id,factory_id,capability,created_by_id) VALUES(12,12,'READ',11)");
 state.user={...state.user,id:12};const response=await GET(request());expect(response.status).toBe(200);const report=await response.json();expect(report.rows).toHaveLength(0);expect(report.unqualified).toHaveLength(0);expect(report.kpis.OTIF).toBeNull();
});
