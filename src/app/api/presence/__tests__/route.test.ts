import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { recordPresence, presenceCounts } from "@/lib/presence";
import { GET, POST } from "../route";
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn() }));
vi.mock("@/lib/presence", async (original) => {
  const actual = await original<typeof import("@/lib/presence")>();
  return { ...actual, recordPresence: vi.fn(), presenceCounts: vi.fn() };
});
const actor = { id: 7, username: "test", fullName: "Test", role: "commercial", darkMode: false };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getUserFromHeaders).mockResolvedValue(actor); });
it("réserve le compteur au superadmin", async () => {
  expect((await GET(new NextRequest("http://test/api/presence"))).status).toBe(403);
  expect(presenceCounts).not.toHaveBeenCalled();
});
it("lie le signal à l'utilisateur authentifié et ignore un ID usurpé", async () => {
  const clientId = "a35410a1-3f54-4c44-bddd-fd37bd30bcee";
  const response = await POST(new NextRequest("http://test/api/presence", { method: "POST", body: JSON.stringify({ clientId, userId: 999 }) }));
  expect(response.status).toBe(200);
  expect(recordPresence).toHaveBeenCalledWith(7, clientId, false);
});
it("refuse les identifiants invalides et les appels anonymes", async () => {
  expect((await POST(new NextRequest("http://test/api/presence", { method: "POST", body: JSON.stringify({ clientId: "bad" }) }))).status).toBe(400);
  vi.mocked(getUserFromHeaders).mockResolvedValue(null);
  expect((await GET(new NextRequest("http://test/api/presence"))).status).toBe(401);
});
it("retire uniquement la présence de l'onglet à la déconnexion", async () => {
  const clientId = "a35410a1-3f54-4c44-bddd-fd37bd30bcee";
  await POST(new NextRequest("http://test/api/presence", { method: "POST", body: JSON.stringify({ clientId, offline: true }) }));
  expect(recordPresence).toHaveBeenCalledWith(7, clientId, true);
});
