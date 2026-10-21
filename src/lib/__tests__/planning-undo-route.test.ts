import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as production } from "@/app/api/production-planning/[id]/undo/route";
import { POST as expedition } from "@/app/api/expedition-planning/[id]/undo/route";
import { PlanningUndoError, undoPlanning } from "../planning-undo";
const state = vi.hoisted(() => ({ user: { id: 1, username: "manager", fullName: "Responsable", role: "planification" } as { id: number; username: string; fullName: string; role: string } | null }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn(async () => state.user) }));
vi.mock("@/lib/planning-undo", () => ({ undoPlanning: vi.fn(), PlanningUndoError: class extends Error { constructor(message: string, public status = 409) { super(message); } } }));
beforeEach(() => { vi.clearAllMocks(); state.user = { id: 1, username: "manager", fullName: "Responsable", role: "planification" }; });
const context = (id = "1") => ({ params: Promise.resolve({ id }) });
const request = (body: unknown = { confirmed: true, expectedUpdatedAt: "v1" }) => new NextRequest("http://test/undo", { method: "POST", body: JSON.stringify(body) });
it.each([production, expedition])("exige une authentification et refuse les lecteurs", async route => {
  state.user = null;
  expect((await route(request(), context())).status).toBe(401);
  state.user = { id: 2, username: "reader", fullName: "Lecteur", role: "gerant" };
  expect((await route(request(), context())).status).toBe(403);
  expect(undoPlanning).not.toHaveBeenCalled();
});
it.each([production, expedition])("exige confirmation, version et identifiant strict", async route => {
  for (const body of [null, {}, { confirmed: false, expectedUpdatedAt: "v1" }, { confirmed: true }, { confirmed: true, expectedUpdatedAt: 42 }]) {
    expect((await route(request(body), context())).status).toBe(400);
  }
  for (const id of ["0", "-1", "1oops", "1.5", "99999999999999999999999"]) expect((await route(request(), context(id))).status).toBe(400);
  expect(undoPlanning).not.toHaveBeenCalled();
});
it.each([[production, "production"], [expedition, "expedition"]] as const)("transmet une correction confirmée au bon planning", async (route, kind) => {
  vi.mocked(undoPlanning).mockResolvedValue({ ok: true, reversedQty: 40, cumulative: 20, status: "EN_ATTENTE" });
  const result = await route(request(), context());
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ reversedQty: 40, cumulative: 20 });
  expect(undoPlanning).toHaveBeenCalledWith(kind, 1, "v1", state.user);
});
it("transmet un conflit explicite sans annoncer une correction réussie", async () => {
  vi.mocked(undoPlanning).mockRejectedValue(new PlanningUndoError("Corrigez d'abord l'expédition"));
  const result = await production(request(), context());
  expect(result.status).toBe(409);
  expect(await result.json()).toEqual({ error: "Corrigez d'abord l'expédition" });
});
