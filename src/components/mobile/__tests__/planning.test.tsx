// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobilePlanning from "../MobilePlanning";
import MobilePlanCreate from "../MobilePlanCreate";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);
const user = { id: 1, role: "planification", username: "test", fullName: "Test" } as User;
const entry = { id: 8, itemId: 7, orderId: 42, orderNumber: "CMD-42", articleName: "Luminaire", plannedQty: 10, planDate: "2026-10-15", status: "EN_COURS", factoryName: "Usine A", itemProducedQty: 0, itemDeliveredQty: 0 };
beforeEach(() => { api.mockReset(); api.mockResolvedValue({ entries: [entry] }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("plannings mobiles", () => {
  it("demande confirmation avant d'appliquer la production et respecte l'annulation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); const actions = userEvent.setup();
    render(<MobilePlanning kind="production" user={user} onOpenOrder={vi.fn()} onSessionExpired={vi.fn()} />);
    await actions.click(await screen.findByRole("button", { name: "Modifier la ligne" }));
    await actions.selectOptions(screen.getByLabelText("État"), "TERMINE");
    await actions.click(screen.getByRole("button", { name: "Enregistrer la ligne" }));
    expect(confirm).toHaveBeenCalled();
    expect(api.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
    confirm.mockReturnValue(true);
    await actions.click(screen.getByRole("button", { name: "Enregistrer la ligne" }));
    await waitFor(() => expect(api.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(true));
    const call = api.mock.calls.find(([, options]) => options?.method === "PUT");
    expect(call?.[0]).toBe("/api/production-planning/8");
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({ status: "TERMINE", reason: "" });
  });
  it("ne présente pas les actions d'édition aux lecteurs", async () => {
    render(<MobilePlanning kind="production" user={{ ...user, role: "gerant" }} onOpenOrder={vi.fn()} onSessionExpired={vi.fn()} />);
    await screen.findByText("Luminaire");
    expect(screen.queryByRole("button", { name: "Modifier la ligne" })).toBeNull();
  });
  it("garde les lignes déjà appliquées en consultation", async () => {
    api.mockResolvedValue({ entries: [{ ...entry, status: "TERMINE", appliedAt: "2026-10-15", appliedQty: 10 }] });
    render(<MobilePlanning kind="production" user={user} onOpenOrder={vi.fn()} onSessionExpired={vi.fn()} />);
    await screen.findByText("Luminaire");
    expect(screen.queryByRole("button", { name: "Modifier la ligne" })).toBeNull();
  });
  it("affiche les articles ignorés par le serveur comme un échec de création", async () => {
    api.mockImplementation(async (url) => url === "/api/factories" ? { factories: [{ id: 2, name: "Usine A", active: true }] } : { created: [], skipped: [{ reason: "Déjà planifié ce jour dans cette usine" }] });
    const actions = userEvent.setup();
    render(<MobilePlanCreate item={{ id: 7, articleName: "Luminaire", quantity: 10 }} onSessionExpired={vi.fn()} />);
    await actions.click(screen.getByRole("button", { name: "Planifier la production" }));
    await waitFor(() => expect((screen.getByLabelText("Usine") as HTMLSelectElement).disabled).toBe(false));
    await actions.selectOptions(screen.getByLabelText("Usine"), "2");
    await actions.click(screen.getByRole("button", { name: "Ajouter au planning" }));
    expect(await screen.findByText("Déjà planifié ce jour dans cette usine")).toBeTruthy();
    expect(screen.queryByText("Article ajouté au planning. Retrouvez-le dans Plus → Plannings.")).toBeNull();
  });
});
