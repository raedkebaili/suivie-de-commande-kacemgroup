// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileCommercial from "../MobileCommercial";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);
const user = { id: 1, role: "commercial", username: "test", fullName: "Test" } as User;
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (url) => {
    if (url === "/api/clients") return { clients: [{ id: 2, name: "Client", code: "C1" }] };
    if (url === "/api/agencies") return { agencies: [{ id: 3, name: "Agence" }] };
    return { order: { id: 42 } };
  });
});
afterEach(cleanup);
describe("formulaire commercial mobile", () => {
  it("crée une commande et ouvre sa fiche après succès serveur", async () => {
    const saved = vi.fn(); const actions = userEvent.setup();
    render(<MobileCommercial user={user} onSaved={saved} onCancel={vi.fn()} onSessionExpired={vi.fn()} />);
    await waitFor(() => expect((screen.getByLabelText("Client") as HTMLSelectElement).disabled).toBe(false));
    await actions.selectOptions(screen.getByLabelText("Client"), "2");
    await actions.selectOptions(screen.getByLabelText("Agence *"), "3");
    await actions.type(screen.getByLabelText("Désignation"), "Luminaire");
    await actions.click(screen.getByRole("button", { name: "Enregistrer la commande" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(42));
    const call = api.mock.calls.find(([url]) => url === "/api/orders");
    expect(call?.[1]?.method).toBe("POST");
    expect(JSON.parse(call?.[1]?.body as string)).toMatchObject({ clientId: "2", agencyId: "3", status: "PREVISION", items: [{ articleName: "Luminaire", quantity: 1 }] });
  });
  it("limite la planification à la création Sur Stock", async () => {
    render(<MobileCommercial user={{ ...user, role: "planification" }} onSaved={vi.fn()} onCancel={vi.fn()} onSessionExpired={vi.fn()} />);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText("État commercial") as HTMLSelectElement).options).toHaveLength(1);
    expect((screen.getByLabelText("État commercial") as HTMLSelectElement).value).toBe("SUR_STOCK");
    expect((screen.getByLabelText("Agence (facultative)") as HTMLSelectElement).required).toBe(false);
  });
  it("conserve le brouillon après un refus serveur", async () => {
    const actions = userEvent.setup(); const saved = vi.fn();
    api.mockImplementation(async (url) => {
      if (url === "/api/clients") return { clients: [{ id: 2, name: "Client", code: "C1" }] };
      if (url === "/api/agencies") return { agencies: [{ id: 3, name: "Agence" }] };
      throw new Error("Verrouillé par un autre utilisateur");
    });
    render(<MobileCommercial user={user} order={{ id: 42, clientId: 2, agencyId: 3, status: "PREVISION", orderDate: "2026-10-15", affaire: "Affaire", items: [{ id: 5, articleName: "Article existant", quantity: 10, productionUnit: "Usine A" }] }} onSaved={saved} onCancel={vi.fn()} onSessionExpired={vi.fn()} />);
    await waitFor(() => expect((screen.getByLabelText("Client") as HTMLSelectElement).disabled).toBe(false));
    await actions.click(screen.getByRole("button", { name: "Enregistrer la commande" }));
    expect(await screen.findByText("Verrouillé par un autre utilisateur")).toBeTruthy();
    expect((screen.getByLabelText("Désignation") as HTMLInputElement).value).toBe("Article existant");
    expect(saved).not.toHaveBeenCalled();
  });
});
