// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import MaterialRequirementsSummary from "../MaterialRequirementsSummary";
import { apiFetch } from "@/lib/api";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const empty = { categories: [], categoryOptions: [], summary: [], totals: { lines: 0, quantity: 0 }, options: { articles: [], families: [], powers: [], clients: [], orderNumbers: [] } };
it("affiche le périmètre non traité et transmet correctement un filtre commercial préfixé", async () => {
  vi.mocked(apiFetch).mockResolvedValue(empty);
  render(<MaterialRequirementsSummary filters={{ status: "comm:BON_COMMANDE", agency: "7", priority: "" }} refreshKey={1} />);
  await screen.findByText("Aucun besoin matière éligible ne correspond aux filtres de la synthèse.");
  const params = new URL(String(vi.mocked(apiFetch).mock.calls[0][0]), "http://test").searchParams;
  expect(params.get("status")).toBe("BON_COMMANDE");
  expect(params.get("agencyId")).toBe("7");
  expect(screen.getByText(/Une commande partiellement traitée est exclue en entier/)).toBeTruthy();
});
it("ne confond pas état de production et état commercial", async () => {
  vi.mocked(apiFetch).mockResolvedValue(empty);
  render(<MaterialRequirementsSummary filters={{ status: "prod:LIVREE", agency: "", priority: "" }} refreshKey={1} />);
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  const params = new URL(String(vi.mocked(apiFetch).mock.calls[0][0]), "http://test").searchParams;
  expect(params.get("productionStatus")).toBe("LIVREE");
  expect(params.has("status")).toBe(false);
});
it("réévalue la synthèse au retour sur la page après une transition faite ailleurs", async () => {
  vi.mocked(apiFetch).mockResolvedValue(empty);
  render(<MaterialRequirementsSummary filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  await screen.findByText("Aucun besoin matière éligible ne correspond aux filtres de la synthèse.");
  const before = vi.mocked(apiFetch).mock.calls.length;
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.length).toBeGreaterThan(before));
});

it("transmet le filtre de planning sans le confondre avec le statut commercial", async () => {
  vi.mocked(apiFetch).mockResolvedValue(empty);
  render(<MaterialRequirementsSummary filters={{ status: "planning:EN_COURS", agency: "", priority: "" }} refreshKey={1} />);
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  const params = new URL(String(vi.mocked(apiFetch).mock.calls[0][0]), "http://test").searchParams;
  expect(params.get("planningStatus")).toBe("EN_COURS");
  expect(params.has("status")).toBe(false);
});
