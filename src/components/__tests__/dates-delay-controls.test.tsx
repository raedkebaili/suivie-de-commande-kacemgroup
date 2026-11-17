// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrderDateFilter from "../OrderDateFilter";
import DelayStatistics from "../DelayStatistics";
import { buildDelayReport } from "@/lib/delay-statistics";
import { apiFetch } from "@/lib/api";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: () => <div>Graphique de retard</div>, Bar: () => null, CartesianGrid: () => null,
  Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));
afterEach(cleanup);
beforeEach(() => { vi.mocked(apiFetch).mockReset(); });
it("applique l’année et le mois et permet d’annuler le filtre sans modifier l’état des commandes", () => {
  const change = vi.fn(); render(<OrderDateFilter onChange={change} />);
  fireEvent.change(screen.getByLabelText("Mode de période des commandes"), { target: { value: "year" } });
  fireEvent.change(screen.getByLabelText("Année des commandes"), { target: { value: "2024" } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Appliquer la période" }));
  expect(change).toHaveBeenLastCalledWith({ from: "2024-01-01", to: "2024-12-31" });
  fireEvent.change(screen.getByLabelText("Mode de période des commandes"), { target: { value: "month" } });
  fireEvent.change(screen.getByLabelText("Mois des commandes"), { target: { value: "02" } });
  fireEvent.click(screen.getByRole("button", { name: "Appliquer la période" }));
  expect(change).toHaveBeenLastCalledWith({ from: "2024-02-01", to: "2024-02-29" });
  fireEvent.change(screen.getByLabelText("Mode de période des commandes"), { target: { value: "all" } });
  expect(change).toHaveBeenLastCalledWith({ from: "", to: "" });
});
it("le calendrier rejette une période inversée avant toute requête", () => {
  const change = vi.fn(); render(<OrderDateFilter onChange={change} />);
  fireEvent.change(screen.getByLabelText("Mode de période des commandes"), { target: { value: "period" } });
  fireEvent.change(screen.getByLabelText("Début de période"), { target: { value: "2026-03-01" } });
  fireEvent.change(screen.getByLabelText("Fin de période"), { target: { value: "2026-02-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Appliquer la période" }));
  expect(screen.getByRole("alert")).toBeTruthy(); expect(change).not.toHaveBeenCalled();
});
it("ne montre pas un taux de retard inventé et calcule à la demande après saisie des seuils", async () => {
  vi.mocked(apiFetch).mockImplementation(async url => ({ ...buildDelayReport([{
    orderId: 1, orderDate: "2026-01-01", factory: "Usine A", quantity: 1, producedQty: 1, deliveredQty: 1,
    productionCompletedOn: "2026-01-10", expeditionCompletedOn: "2026-01-20",
  }], url.includes("productionDays=5") ? 5 : null, url.includes("expeditionDays=10") ? 10 : null, "2026-02-01"), today: "2026-02-01" }));
  render(<DelayStatistics />);
  await screen.findByText(/Aucun seuil n’est imposé/);
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.change(screen.getByLabelText("Délai cible production en jours"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Délai cible livraison en jours"), { target: { value: "10" } });
  expect(apiFetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Calculer les taux" }));
  await screen.findByRole("img", { name: /Diagramme des taux de retard/ });
  expect(screen.getAllByText("100 %")).toHaveLength(2);
  expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain("productionDays=5&expeditionDays=10");
  fireEvent.change(screen.getByLabelText("Périmètre des retards"), { target: { value: "Usine A" } });
  expect(screen.getAllByText("Usine A").length).toBeGreaterThan(1);
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
});
