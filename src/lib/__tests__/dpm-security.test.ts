import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { assertDpmRestoreSafe, collectDpmBackup, restoreDpmBackup } from "../dpm-backup";
import { requireDpmCapability } from "../dpm-access";
import { expeditionBatches } from "@/db/schema";
import { hasDpmProofs, isDpmProofFile, canReadDpmProofFile } from "../dpm-proofs";
vi.mock("@/db", () => ({ db: {} }));
async function createDb() {
  const client = new PGlite();
  for (const f of readdirSync("drizzle").filter(f => /^000[0-7]_.*\.sql$/.test(f)).sort()) await client.exec(readFileSync(`drizzle/${f}`, "utf8"));
  await client.exec(`
    INSERT INTO users (username,password_hash,full_name,role) VALUES ('admin','test-only','Admin','superadmin');
    INSERT INTO agencies (name,code) VALUES ('Agence','A');
    INSERT INTO clients (name,code) VALUES ('Client','C');
    INSERT INTO factories (code,name) VALUES ('OLD-1','Historique 1'),('OLD-2','Historique 2');
    INSERT INTO orders (order_number,client_id,agency_id) VALUES ('O1',1,1),('O2',1,1);
    INSERT INTO order_items (order_id,article_name,quantity) VALUES (1,'LED',10),(2,'Other',10);
    INSERT INTO drive_documents (drive_file_id,file_name,uploaded_by_name,order_id) VALUES ('remote-proof','preuve.pdf','Admin',1);
  `);
  return { client, db: drizzle(client) };
}
describe("DPM security on PostgreSQL", () => {
  let source: Awaited<ReturnType<typeof createDb>>;
  beforeAll(async () => { source = await createDb(); }, 60000);
  afterAll(async () => { await source.client.close(); });
  it("denies even a superadmin without an explicit site capability", async () => {
    await expect(requireDpmCapability(source.db as never, 1, 1, "INDUSTRIAL_APPROVAL")).rejects.toThrow("explicite");
    await source.client.exec("INSERT INTO dpm_grants(user_id,factory_id,capability,created_by_id) VALUES (1,1,'READ',1)");
    await expect(requireDpmCapability(source.db as never, 1, 1, "READ")).resolves.toBeUndefined();
    await expect(requireDpmCapability(source.db as never, 1, 2, "READ")).rejects.toThrow();
    await expect(requireDpmCapability(source.db as never, 1, 1, "INDUSTRIAL_APPROVAL")).rejects.toThrow();
  });
  it("validates JSON, preserves initial commitments and rejects wrong revisions", async () => {
    await source.client.exec(`INSERT INTO dpm_calendars(calendar_key,version,name,effective_from,created_by_id) VALUES ('REF',1,'Reference','2026-01-01',1)`);
    const insert = (items: string, version = 1, previous = "NULL", original = "2026-01-01") => `INSERT INTO dpm_commitments(order_id,version,previous_id,original_order_date,confirmed_due_date,calendar_id,agreed_items,reason,decision,validated_by_id,validated_at,proof_document_id,created_by_id) VALUES (1,${version},${previous},'${original}','2026-10-20',1,'${items}','Confirmed','APPROVED',1,now(),1,1)`;
    await source.client.exec(insert('[{"itemId":1,"quantity":10}]'));
    await expect(source.client.exec("UPDATE dpm_commitments SET confirmed_due_date = '2027-01-01' WHERE id=1")).rejects.toThrow("immutable");
    await expect(source.client.exec(insert('[{"itemId":2,"quantity":10}]',2,"1"))).rejects.toThrow("wrong");
    await expect(source.client.exec(insert('[{"itemId":1,"quantity":10,"extra":true}]',2,"1"))).rejects.toThrow("JSON");
    await expect(source.client.exec(insert('[{"itemId":1,"quantity":10}]',2,"1","2025-01-01"))).rejects.toThrow("revision");
    await source.client.exec(insert('[{"itemId":1,"quantity":10}]',2,"1"));
  });
  it("rejects wrong delivery articles, overcommitted quantities and wrong expedition lots", async () => {
    await source.client.exec("INSERT INTO dpm_deliveries(order_id,number,dispatch_factory_id,request_key,created_by_id) VALUES(1,'BL1',1,'00000000-0000-4000-8000-000000000001',1)");
    const line = (item: number, qty: number) => `INSERT INTO dpm_delivery_lines(delivery_id,item_id,manufacturing_factory_id,commitment_id,planned_qty,due_date,created_by_id) VALUES(1,${item},1,1,${qty},'2026-10-20',1)`;
    await expect(source.client.exec(line(2,1))).rejects.toThrow("mismatch");
    await expect(source.client.exec(line(1,11))).rejects.toThrow("exceeds");
    await source.client.exec(line(1,10));
    const [{id}] = (await source.client.query<{id:number}>("SELECT id FROM dpm_delivery_lines")).rows;
    await source.client.exec("INSERT INTO expedition_batches(item_id,order_id,quantity,cumulative_total,delivered_by,delivery_date) VALUES(2,2,2,2,'Admin','2026-10-15')");
    await expect(source.client.exec(`INSERT INTO dpm_delivery_movements(line_id,batch_id,created_by_id) VALUES(${id},1,1)`)).rejects.toThrow("association");
  });
  it("enforces workflow sequence and keeps approved decisions immutable", async () => {
    await source.client.exec("INSERT INTO dpm_events(reference,factory_id,origin,category,starts_at,resource_key,detailed_cause,request_key,created_by_id) VALUES('E1',1,'EXTERNAL','POWER',now(),'line-1','STEG','00000000-0000-4000-8000-000000000002',1)");
    const review = (step: string) => `INSERT INTO dpm_event_reviews(event_id,event_version,step,decision,comment,evidence_snapshot,created_by_id) VALUES(1,1,'${step}','APPROVED','Checked','[]',1)`;
    await expect(source.client.exec(review('INDUSTRIAL'))).rejects.toThrow("previous");
    for (const step of ['DECLARATION','TECHNICAL','IMPACT','LOGISTICS','INDUSTRIAL']) await source.client.exec(review(step));
    await expect(source.client.exec("UPDATE dpm_event_reviews SET comment = 'Changed'")).rejects.toThrow("immutable");
  });
  it("validates hours and weekday structures strictly", async () => {
    for (const hours of ['{"1":[{"start":"25:00","end":"26:00"}]}','{"1":[{"start":"12:00","end":"08:00"}]}','{"1":[{"start":"08:00","end":"12:00"},{"start":"11:00","end":"13:00"}]}']) {
      await expect(source.client.exec(`UPDATE dpm_calendars SET working_intervals='${hours}'`)).rejects.toThrow();
    }
    await expect(source.client.exec(`UPDATE dpm_calendars SET working_weekdays='[1,1,8]'`)).rejects.toThrow();
    await expect(source.client.exec(`UPDATE dpm_calendars SET working_intervals='{"1":[{"start":"08:00","end":"12:00"}]}'`)).rejects.toThrow("immutable");
  });
  it("protects proof references and refuses implicit file access", async () => {
    await source.client.exec("INSERT INTO dpm_event_impacts(event_id,event_version,order_id,commitment_id,critical_path_key,starts_at,ends_at,demonstrated_impact,claimed_minutes,admissible_minutes,decision,validator_comment,proof_document_id,validated_by_id,validated_at,created_by_id) VALUES(1,1,1,1,'critical-1','2026-10-15 08:00+01','2026-10-15 09:00+01','Proven interruption',60,60,'APPROVED','Checked',1,1,now(),1)");
    expect(await hasDpmProofs(source.db as never)).toBe(true);
    expect(await isDpmProofFile('remote-proof',source.db as never)).toBe(true);
    expect(await canReadDpmProofFile('remote-proof',1,source.db as never)).toBe(false);
    expect(await canReadDpmProofFile('unrelated',1,source.db as never)).toBe(true);
    await expect(source.client.exec("DELETE FROM drive_documents WHERE id=1")).rejects.toThrow();
  });
  it("rejects receipt quantities exceeding signed net shipments and preserves corrections", async () => {
    const [{id}] = (await source.client.query<{id:number}>("SELECT id FROM dpm_delivery_lines")).rows;
    await source.client.exec("INSERT INTO expedition_batches(item_id,order_id,quantity,cumulative_total,delivered_by,delivery_date) VALUES(1,1,6,6,'Admin','2026-10-15')");
    await source.client.exec(`INSERT INTO dpm_delivery_movements(line_id,batch_id,created_by_id) VALUES(${id},2,1)`);
    const receipt = (qty:number) => `INSERT INTO dpm_receipts(line_id,reference,received_at,received_qty,accepted_qty,status,proof_document_id,validated_by_id,validated_at,request_key,created_by_id) VALUES(${id},'R1',now(),${qty},${qty},'ACCEPTED',1,1,now(),'00000000-0000-4000-8000-000000000004',1)`;
    await expect(source.client.exec(receipt(7))).rejects.toThrow("exceeds");
    await source.client.exec(receipt(6));
    await expect(source.client.exec("UPDATE dpm_receipts SET accepted_qty=1")).rejects.toThrow("immutable");
  });
  it("round-trips every DPM table and audit without deleting destination history", async () => {
    await source.client.exec("INSERT INTO dpm_audit_records(entity_type,entity_id,operation,reason,request_key,capability_used,created_by_id) VALUES('commitment','1','INSERT','Confirmed','00000000-0000-4000-8000-000000000003','CONFIGURE',1)");
    const data = await collectDpmBackup(source.db as never);
    const destination = await createDb();
    try {
      // Restore legacy dependencies first, as the existing backup route does.
      const batches = await source.db.select().from(expeditionBatches);
      if (batches.length) await destination.db.insert(expeditionBatches).values(batches);
      await destination.db.transaction(async tx => {
        await assertDpmRestoreSafe(tx as never, data);
        await restoreDpmBackup(tx as never, JSON.parse(JSON.stringify(data)));
      });
      expect(await collectDpmBackup(destination.db as never)).toEqual(data);
      await expect(assertDpmRestoreSafe(destination.db as never, data)).rejects.toThrow("non vide");
      await expect(assertDpmRestoreSafe(destination.db as never, {})).rejects.toThrow("non vide");
      await expect(destination.client.exec("DELETE FROM dpm_audit_records")).rejects.toThrow("append-only");
      expect((await destination.client.query("SELECT drive_file_id FROM drive_documents WHERE id=1")).rows).toEqual([{drive_file_id:'remote-proof'}]);
      await expect(destination.client.exec("DELETE FROM drive_documents WHERE id=1")).rejects.toThrow();
    } finally { await destination.client.close(); }
  }, 60000);
});
