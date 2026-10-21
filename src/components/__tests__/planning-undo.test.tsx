// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PlanningProductionView from "../PlanningProductionView";
import ExpeditionPlanningView from "../ExpeditionPlanningView";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/color-context", () => ({ useColors: () => ({ getColor: () => "#ffffff" }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const manager: User = { id: 1, username: "manager", fullName: "Responsable", role: "planification" };
function setup(kind: "production" | "expedition", fail = false) {
  let undone = false;
  const common = { id: 1, itemId: 1, orderId: 1, articleName: "Article A", orderNumber: "BC-1", planDate: "2026-10-21", plannedQty: 100,
    itemQuantity: 100, itemProducedQty: 100, itemDeliveredQty: 40, updatedAt: "v1", priority: "NORMALE" };
  vi.mocked(apiFetch).mockImplementation(async (url, options) => {
    if (url === "/api/factories") return { factories: [] };
    if (url.endsWith("/undo")) {
      if (fail) throw new Error("Annulez d'abord les expéditions concernées");
      undone = true; return { reversedQty: 40 };
    }
    if (options?.method) throw new Error("Mutation inattendue");
    if (kind === "production") return { entries: [{ ...common, status: undone ? "EN_ATTENTE" : "TERMINE", appliedQty: undone ? 0 : 40, appliedAt: undone ? null : "2026-10-21", factoryId: 1, factoryName: "Usine", reason: null }] };
    return { plans: [{ ...common, status: undone ? "NON_TRAITE" : "LIVRE", loadedQty: undone ? 0 : 40, driverName: "Chauffeur", note: null }], drivers: [] };
  });
}
it.each(["production", "expedition"] as const)("demande confirmation sans mutation si l'utilisateur refuse (%s)", async kind => {
  setup(kind); const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(kind === "production" ? <PlanningProductionView user={manager} /> : <ExpeditionPlanningView user={manager} />);
  fireEvent.click(await screen.findByRole("button", { name: /Retour en arrière/ }));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("40 unité(s)"));
  expect(vi.mocked(apiFetch).mock.calls.some(([url]) => url.endsWith("/undo"))).toBe(false);
});
it.each(["production", "expedition"] as const)("confirme la soustraction exacte, appelle l'API et recharge la ligne (%s)", async kind => {
  setup(kind); vi.spyOn(window, "confirm").mockReturnValue(true);
  render(kind === "production" ? <PlanningProductionView user={manager} /> : <ExpeditionPlanningView user={manager} />);
  fireEvent.click(await screen.findByRole("button", { name: /Retour en arrière/ }));
  await screen.findByText(/Retour effectué/);
  const mutation = vi.mocked(apiFetch).mock.calls.find(([url]) => url.endsWith("/undo"));
  expect(mutation?.[0]).toBe(`/api/${kind}-planning/1/undo`);
  expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({ confirmed: true, expectedUpdatedAt: "v1" });
  expect((await screen.findByRole("button", { name: /Retour en arrière/ }) as HTMLButtonElement).disabled).toBe(true);
});
it("affiche un blocage serveur sans remettre visuellement la ligne à zéro", async () => {
  setup("production", true); vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<PlanningProductionView user={manager} />);
  fireEvent.click(await screen.findByRole("button", { name: /Retour en arrière/ }));
  await screen.findByText("Annulez d'abord les expéditions concernées");
  await waitFor(() => expect((screen.getByRole("button", { name: /Retour en arrière/ }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByText(/Retour effectué/)).toBeNull();
});
it.each(["production", "expedition"] as const)("ne propose pas de correction aux lecteurs (%s)", async kind => {
  setup(kind); const user: User = { ...manager, role: kind === "production" ? "consultant_prod" : "gerant" };
  render(kind === "production" ? <PlanningProductionView user={user} /> : <ExpeditionPlanningView user={user} />);
  await screen.findByText("Article A");
  expect(screen.queryByRole("button", { name: /Retour en arrière/ })).toBeNull();
});
