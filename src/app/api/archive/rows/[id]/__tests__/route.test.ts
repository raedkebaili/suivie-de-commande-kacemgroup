import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "../route";
import { db } from "@/db";
import { getUserFromHeaders } from "@/lib/auth";
vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn(), logActivity: vi.fn() }));
const set = vi.fn();
const stored = { id: 88, sheetId: 1, rowIndex: 0, cells: '["Luminaire","0"]', stateOverride: null, stateDetected: "LIVRE" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockReset();
  vi.mocked(getUserFromHeaders).mockResolvedValue({ id: 1, username: "test", fullName: "Test", role: "planification", darkMode: false });
  vi.mocked(db.select)
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [stored] }) }) } as never)
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [{ id: 1, name: "Archive", resteColumnIndex: 1, columns: '["Article","Reste à livrer"]' }] }) }) } as never)
    .mockReturnValueOnce({ from: () => ({ where: async () => [{ columnIndex: 0 }] }) } as never);
  set.mockImplementation((values) => ({ where: () => ({ returning: async () => [{ ...stored, ...values }] }) }));
  vi.mocked(db.update).mockReturnValue({ set } as never);
});
const request = () => new NextRequest("http://test/api/archive/rows/88", { method: "PUT", body: JSON.stringify({ state: "BON_COMMANDE" }) });
const context = { params: Promise.resolve({ id: "88" }) };
it("enregistre Bon de commande malgré un reste nul, sans effacer ni champs ni marqueurs ni couleurs", async () => {
  const response = await PUT(request(), context);
  expect(response.status).toBe(200);
  expect((await response.json()).row).toMatchObject({ state: "BON_COMMANDE", stateOverride: "BON_COMMANDE", stateSource: "manuel", modifiedColumns: [0], cells: ["Luminaire", "0"] });
  expect(set.mock.calls[0][0]).toMatchObject({ stateOverride: "BON_COMMANDE" });
  expect(set.mock.calls[0][0]).not.toHaveProperty("cells");
  expect(db.insert).not.toHaveBeenCalled();
  expect(db.delete).not.toHaveBeenCalled();
});
it("ne donne pas au commercial le droit de changer cet état", async () => {
  vi.mocked(getUserFromHeaders).mockResolvedValue({ id: 2, username: "sales", fullName: "Commercial", role: "commercial", darkMode: false });
  expect((await PUT(request(), context)).status).toBe(403);
  expect(db.update).not.toHaveBeenCalled();
});
