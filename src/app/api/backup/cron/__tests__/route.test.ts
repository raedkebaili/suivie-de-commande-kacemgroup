import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { runAutomaticBackup } from "@/lib/automatic-backup";
import { GET } from "../route";
vi.mock("@/lib/automatic-backup", () => ({ runAutomaticBackup: vi.fn(async () => ({ ok: true })) }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("accepte le Bearer dédié envoyé par Vercel et ne force pas la sauvegarde", async () => {
  vi.stubEnv("CRON_SECRET", "dedicated-secret");
  const response = await GET(new NextRequest("http://test/api/backup/cron", { headers: { authorization: "Bearer dedicated-secret" } }));
  expect(response.status).toBe(200);
  expect(runAutomaticBackup).toHaveBeenCalledWith({ source: "cron" });
});
it("refuse un secret absent ou incorrect sans créer de sauvegarde", async () => {
  vi.stubEnv("CRON_SECRET", "dedicated-secret");
  expect((await GET(new NextRequest("http://test/api/backup/cron"))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(new NextRequest("http://test/api/backup/cron", { headers: { authorization: "Bearer " } }))).status).toBe(401);
  expect(runAutomaticBackup).not.toHaveBeenCalled();
});
