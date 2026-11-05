// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PlanningOverview from "../PlanningOverview";
import PlanningProductionView from "../PlanningProductionView";
import ProductionView from "../ProductionView";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/color-context", () => ({ useColors: () => ({ getColor: () => "#ffffff" }) }));
const user: User = { id: 1, role: "planification", username: "manager", fullName: "Responsable" };
const rows = [
  { id: 1, itemId: 10, orderId: 1, planDate: "2000-01-01", articleName: "Luminaire ancien", orderNumber: "BC-1", clientName: "Client", factoryName: "Usine A", status: "EN_ATTENTE", plannedQty: 40, appliedQty: 0 },
  { id: 2, itemId: 10, orderId: 1, planDate: "2000-02-02", articleName: "Luminaire ancien", orderNumber: "BC-1", clientName: "Client", factoryName: "Usine A", status: "TERMINE", plannedQty: 60, appliedQty: 60 },
  { id: 3, itemId: 20, orderId: 2, planDate: "2001-01-01", articleName: "Moteur Été", orderNumber: "BC-2", clientName: "Client", factoryName: "Usine B", status: "SUSPENDU", plannedQty: 10, appliedQty: 0 },
];
beforeEach(() => { vi.mocked(apiFetch).mockReset().mockResolvedValue({ entries: rows }); });
afterEach(cleanup);
it("le bilan est chargé à la demande sur toutes les dates, déduplique les articles et filtre sans aucune écriture", async () => {
  render(<PlanningOverview kind="production" />);
  expect(apiFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Bilan global/ }));
  await screen.findByRole("table", { name: "Bilan global des plannings" });
  expect(apiFetch).toHaveBeenCalledWith("/api/production-planning?date=all", expect.anything());
  expect(screen.getByText("3 ligne(s) · 2 article(s) distinct(s) · 2 commande(s)")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Rechercher dans le bilan global"), { target: { value: "ete usine b" } });
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  expect(screen.getByText("Moteur Été")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("État du bilan global"), { target: { value: "TERMINE" } });
  expect(screen.getByText("Aucune ligne ne correspond aux filtres.")).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
});
it("le planning de production passe du journalier au global et conserve les dates et les cinq états", async () => {
  vi.mocked(apiFetch).mockImplementation(async url => {
    if (url === "/api/factories") return { factories: [] };
    return { entries: url.includes("date=all") ? rows : [rows[2]] };
  });
  render(<PlanningProductionView user={user} />);
  await screen.findByText("Moteur Été");
  expect(screen.queryByText("2000-01-01")).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Bilan global — toutes les dates" }));
  await screen.findByText("2000-01-01");
  const select = screen.getByLabelText("Filtrer l’état du planning production");
  expect(within(select).getAllByRole("option")).toHaveLength(6);
  fireEvent.change(select, { target: { value: "TERMINE" } });
  expect(screen.queryByText("Moteur Été")).toBeNull();
  expect(screen.getByText("2000-02-02")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Rechercher dans le planning production"), { target: { value: "introuvable" } });
  expect(screen.getByText("Aucun article ne correspond au périmètre et aux filtres sélectionnés.")).toBeTruthy();
});
it("Production filtre les articles sans perdre les données de la commande complète", async () => {
  vi.mocked(apiFetch).mockImplementation(async url => ({ items: [
    { itemId: 1, orderId: 1, orderNumber: "BC-1", articleName: "Produit terminé", quantity: 10, producedQty: 10, deliveredQty: 0, priority: "NORMALE", productionStatus: "EN_INSTANCE" },
    { itemId: 2, orderId: 1, orderNumber: "BC-1", articleName: "Produit en attente", quantity: 20, producedQty: 0, deliveredQty: 0, priority: "NORMALE", productionStatus: "EN_INSTANCE" },
  ], matchingItemIds: url.includes("workflow=") ? [1] : null, batches: [] }));
  render(<ProductionView user={user} />);
  await screen.findByText("#BC-1");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "workflow:prod-item:READY" } });
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some(([url]) => url.includes("workflow=prod-item%3AREADY"))).toBe(true));
  await screen.findByText("#BC-1"); fireEvent.click(screen.getByText("#BC-1"));
  await screen.findByText("Produit terminé");
  expect(screen.queryByText("Produit en attente")).toBeNull();
});

it("ignore une ancienne réponse de bilan après fermeture et réouverture", async () => {
  let resolveOld!: (value: unknown) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ entries: [rows[2]] });
  render(<PlanningOverview kind="production" />);
  const button = screen.getByRole("button", { name: /Bilan global/ });
  fireEvent.click(button); fireEvent.click(button); fireEvent.click(button);
  await screen.findByText("Moteur Été");
  resolveOld({ entries: rows });
  await waitFor(() => expect(screen.queryByText("2000-01-01")).toBeNull());
});

it("le filtre opérationnel n’expose plus les anciens états ni les filtres de l’autre section", async () => {
  vi.mocked(apiFetch).mockResolvedValue({ items: [], batches: [] });
  render(<ProductionView user={user} />);
  const options = within(screen.getByRole("combobox")).getAllByRole("option") as HTMLOptionElement[];
  expect(options).toHaveLength(11);
  expect(options.some(option => option.value === "workflow:prod-item:ACTIVE")).toBe(true);
  expect(options.some(option => option.value === "workflow:prod-order:READY")).toBe(true);
  expect(options.some(option => /production:|ship-|SUSPENDU|TERMINE/.test(option.value))).toBe(false);
});
it("une erreur de filtre ne réaffiche pas les résultats du filtre précédent", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce({ items: [{ itemId: 1, orderId: 1, orderNumber: "ANCIEN", articleName: "Ancien", quantity: 10, producedQty: 0, deliveredQty: 0, priority: "NORMALE", productionStatus: "EN_INSTANCE" }], batches: [] }).mockRejectedValue(new Error("Lecture impossible"));
  render(<ProductionView user={user} />);
  await screen.findByText("#ANCIEN");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "workflow:prod-item:ACTIVE" } });
  await screen.findByRole("alert");
  expect(screen.queryByText("#ANCIEN")).toBeNull();
});
