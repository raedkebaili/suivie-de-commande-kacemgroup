import { expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { collectBackupData } from "../backup-data";
vi.mock("@/db", () => ({ db: {} }));
it("sauvegarde les métadonnées documents et archive, sans mots de passe, présence ni récursion", async () => {
  const tables: string[] = [];
  const executor = { select: () => ({ from: async (table: Parameters<typeof getTableName>[0]) => {
    const name = getTableName(table); tables.push(name);
    if (name === "users") return [{ id: 1, username: "test", passwordHash: "must-not-leak" }];
    return [];
  } }) };
  const { data } = await collectBackupData(executor as never);
  expect(data).toHaveProperty("driveDocuments");
  expect(data).toHaveProperty("archiveCellModifications");
  expect(JSON.stringify(data)).not.toContain("must-not-leak");
  expect(tables).not.toContain("user_presence");
  expect(tables).not.toContain("backup_history");
});
