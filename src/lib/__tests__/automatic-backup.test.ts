import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { backupHistory, systemSettings } from "@/db/schema";
import { collectBackupData } from "../backup-data";
import { runAutomaticBackup } from "../automatic-backup";
vi.mock("@/db", () => ({ db: { transaction: vi.fn(), insert: vi.fn() } }));
vi.mock("../backup-data", () => ({ collectBackupData: vi.fn() }));
let settings: { key: string; value: string }[];
let lastSuccess: string | null;
let locked: boolean;
let events: string[];
const deletion = vi.fn();
const insert = vi.fn((table) => ({ values: (values: Record<string, unknown>) => {
  events.push(table === backupHistory ? `insert:${values.status}` : `setting:${values.key}`);
  return { onConflictDoUpdate: async () => {}, returning: async () => [{ id: 101 }] };
} }));
const tx = {
  execute: vi.fn(async () => ({ rows: [{ locked }] })), insert,
  select: vi.fn(() => ({ from: (table: unknown) => {
    if (table === systemSettings) return Promise.resolve(settings);
    const chain = {
      where: () => chain, orderBy: () => chain,
      limit: async () => lastSuccess ? [{ createdAt: lastSuccess }] : [],
      then: (resolve: (value: unknown) => void) => resolve([{ id: 101 }, { id: 80 }, { id: 50 }]),
    };
    return chain;
  } })),
  delete: deletion,
};
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-19T22:00:00Z"));
  vi.stubEnv("BACKUP_TIMEZONE", "Africa/Tunis");
  settings = [{ key: "backup_enabled", value: "true" }, { key: "backup_max_count", value: "2" }];
  lastSuccess = "2026-10-18T22:00:00Z"; locked = true; events = [];
  deletion.mockReset().mockImplementation(() => ({ where: async () => { events.push("purge"); } }));
  vi.mocked(collectBackupData).mockReset().mockResolvedValue({ data: { users: [] }, totalRecords: 0 } as never);
  vi.mocked(db.transaction).mockImplementation(async (callback) => callback(tx as never));
  vi.mocked(db.insert).mockImplementation(insert as never);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("sauvegarde transactionnelle", () => {
  it("insère une sauvegarde avant la purge et utilise le collecteur dans la transaction", async () => {
    const result = await runAutomaticBackup();
    expect(result).toMatchObject({ ok: true, id: 101, deletedOldBackups: 1 });
    expect(collectBackupData).toHaveBeenCalledWith(tx);
    expect(events.indexOf("insert:success")).toBeLessThan(events.indexOf("purge"));
  });
  it("ne purge rien si la collecte échoue et enregistre un échec relançable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(collectBackupData).mockRejectedValue(new Error("Panne DB"));
    await expect(runAutomaticBackup()).rejects.toThrow("Panne DB");
    expect(deletion).not.toHaveBeenCalled();
    expect(events).toContain("insert:error");
    expect(events).not.toContain("setting:backup_last_success");
  });
  it("ignore un déclenchement concurrent, sans créer de doublon", async () => {
    locked = false;
    expect(await runAutomaticBackup()).toMatchObject({ skipped: true });
    expect(collectBackupData).not.toHaveBeenCalled();
  });
  it("ignore une échéance déjà sauvegardée, mais autorise le test admin forcé", async () => {
    lastSuccess = "2026-10-19T21:30:00Z";
    expect(await runAutomaticBackup()).toMatchObject({ skipped: true });
    expect(collectBackupData).not.toHaveBeenCalled();
    expect(await runAutomaticBackup({ force: true })).toMatchObject({ ok: true });
  });
  it("relance un conflit de snapshot PostgreSQL sans enregistrer un faux échec", async () => {
    vi.mocked(db.transaction).mockRejectedValueOnce(Object.assign(new Error("serialization"), { cause: { code: "40001" } }));
    expect(await runAutomaticBackup()).toMatchObject({ ok: true });
    expect(events).not.toContain("insert:error");
  });
  it("respecte la désactivation", async () => {
    settings = [{ key: "backup_enabled", value: "false" }];
    expect(await runAutomaticBackup()).toMatchObject({ skipped: true });
    expect(collectBackupData).not.toHaveBeenCalled();
  });
});
