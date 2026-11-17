import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({ user: null as null | {id:number;role:string} }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({getUserFromHeaders:async () => auth.user}));
import { GET, POST } from "@/app/api/dpm/setup/route";
const old = process.env.DPM_CONFIGURATION_ENABLED;
afterEach(() => { if (old === undefined) delete process.env.DPM_CONFIGURATION_ENABLED; else process.env.DPM_CONFIGURATION_ENABLED=old; auth.user=null; });
describe("DPM setup closed by default", () => {
  it("exposes no mapping endpoint before explicit activation", async () => {
    delete process.env.DPM_CONFIGURATION_ENABLED;
    expect((await GET(new NextRequest('http://localhost/api/dpm/setup'))).status).toBe(404);
  });
  it("refuses unauthenticated and non-admin assignments", async () => {
    process.env.DPM_CONFIGURATION_ENABLED='true';
    for (const user of [null,{id:2,role:'commercial'}]) {
      auth.user=user;
      expect((await POST(new NextRequest('http://localhost/api/dpm/setup',{method:'POST',body:'{}'}))).status).toBe(403);
    }
  });
  it("rejects invented reporting sites before any database mutation", async () => {
    process.env.DPM_CONFIGURATION_ENABLED='true'; auth.user={id:1,role:'superadmin'};
    const response = await POST(new NextRequest('http://localhost/api/dpm/setup',{method:'POST',body:JSON.stringify({factoryId:1,reportingCode:'OTHER',reason:'test'})}));
    expect(response.status).toBe(400);
  });
});
