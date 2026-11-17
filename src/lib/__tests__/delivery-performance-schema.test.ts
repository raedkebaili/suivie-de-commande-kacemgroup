import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, it, expect } from "vitest";

describe("delivery performance additive foundation", () => {
  it("applies after existing migrations, preserves rows and starts without grants or facts", async () => {
    const db = new PGlite();
    try {
      for (const file of readdirSync("drizzle").filter(f => /^000[0-6]_.*\.sql$/.test(f)).sort()) {
        await db.exec(readFileSync(`drizzle/${file}`, "utf8"));
      }
      await db.exec("INSERT INTO users (username, password_hash, full_name) VALUES ('foundation-test','not-a-real-hash','Test')");
      await db.exec(readFileSync("drizzle/0007_delivery_performance_foundation.sql", "utf8"));
      expect((await db.query("SELECT username FROM users")).rows).toEqual([{username: "foundation-test"}]);
      for (const table of ["dpm_grants", "dpm_site_settings", "dpm_commitments", "dpm_receipts", "dpm_events"]) {
        expect((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows).toEqual([{n: 0}]);
      }
      await db.exec("INSERT INTO dpm_calendars (calendar_key,version,name,effective_from,created_by_id) VALUES ('reference',1,'Référence','2026-10-15',1)");
      expect((await db.query("SELECT working_weekdays FROM dpm_calendars")).rows).toEqual([{working_weekdays:[1,2,3,4,5,6]}]);
      await expect(db.exec("INSERT INTO dpm_grants (user_id,capability,created_by_id) VALUES (1,'IMPLICIT_ADMIN',1)")).rejects.toThrow();
      await expect(db.exec("INSERT INTO dpm_site_settings (factory_id,reporting_code,region_code,enabled,created_by_id) VALUES (999,'KER-01','KER',true,1)")).rejects.toThrow();
      for (const operation of ["UPDATE dpm_audit_records SET reason = 'changed'", "DELETE FROM dpm_audit_records", "TRUNCATE dpm_audit_records"]) {
        await expect(db.exec(operation)).rejects.toThrow("append-only");
      }
    } finally { await db.close(); }
  }, 60000);
});
