// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ArticleGroupingView from "../ArticleGroupingView";
import { apiFetch } from "@/lib/api";
import { groupArticles } from "@/lib/article-grouping";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(cleanup);
it("affiche la famille du catalogue dans la colonne Famille, et pas l’origine automatique", async () => {
  const groups = groupArticles([{ articleName: "Luminaire NETLUX LED 75W IP66", quantity: 5 }], undefined, [{ category: "LUMINAIRE D'ECLAIRAGE PUBLIQUE", subFamily: "NETLUX", variant: "" }]);
  vi.mocked(apiFetch).mockResolvedValue({ groups, totals: null });
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  const family = await screen.findByRole("cell", { name: "LUMINAIRE D'ECLAIRAGE PUBLIQUE" });
  expect(within(family).queryByText("Auto")).toBeNull();
  expect(await screen.findByRole("cell", { name: "75 W" })).toBeTruthy();
});

import { fireEvent, waitFor } from "@testing-library/react";
import { requirementSummary } from "@/lib/material-requirements";
function materialResult(canConfigure: boolean) {
  const groups = groupArticles([{ itemId: 1, articleName: "NETLUX 75W", quantity: 10, components: [{ categoryKey: "driver", categoryName: "Driver", materialId: 2, materialReference: "DX", materialLabel: "Driver X" }] }, { itemId: 2, articleName: "NETLUX 100W", quantity: 20, components: [] }]);
  const lines = groups.flatMap(g => g.lines.map(l => ({ ...l, components: l.components || [], groupKey: g.key })));
  const categories = [{ key: "driver", name: "Driver", active: true }];
  return { groups, lines, categories, selectedKeys: ["driver"], summary: requirementSummary(lines, categories), canConfigure, totals: { groups: 1, lines: 2, quantity: 30 }, options: { clients: ["A", "B"], articles: [], families: [], powers: [], orderNumbers: [] } };
}
it("affiche les composants et besoins, les manquants et non les livraisons", async () => {
  vi.mocked(apiFetch).mockResolvedValue(materialResult(false));
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  const table = await screen.findByRole("table", { name: "Articles et besoins matières pour les lignes filtrées" });
  expect(within(table).getByRole("columnheader", { name: "Driver" })).toBeTruthy();
  expect(within(table).getByRole("columnheader", { name: "Total Driver" })).toBeTruthy();
  expect(within(table).getByText("DX — Driver X")).toBeTruthy();
  expect(within(table).getByText("Non renseigné")).toBeTruthy();
  expect(within(table).getByText("10 + ? (1 ligne)")).toBeTruthy();
  expect(within(table).queryByRole("columnheader", { name: "Livré" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Configurer les catégories" })).toBeNull();
});
it("permet à l'admin d'enregistrer une sélection vide pour tous", async () => {
  vi.mocked(apiFetch).mockClear().mockResolvedValue(materialResult(true));
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  fireEvent.click(await screen.findByRole("button", { name: "Configurer les catégories" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Driver" }));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer pour tous" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/orders/grouped-articles/config", expect.objectContaining({ method: "PUT", body: '{"selectedKeys":[]}' })));
});
it("envoie ensemble les filtres multiples, les tris et le périmètre du tableau commandes", async () => {
  vi.mocked(apiFetch).mockClear().mockResolvedValue(materialResult(false));
  render(<ArticleGroupingView filters={{ status: "EN_INSTANCE", agency: "7", priority: "URGENT" }} refreshKey={1} />);
  await screen.findByRole("table", { name: "Articles et besoins matières pour les lignes filtrées" });
  fireEvent.click(screen.getByRole("button", { name: "Filtres et tris multiples" }));
  fireEvent.change(screen.getByLabelText("Affaire / besoin"), { target: { value: "École" } });
  fireEvent.change(screen.getByLabelText("Champ de tri 1"), { target: { value: "quantity" } });
  const select = screen.getByLabelText("Clients (choix multiples)") as HTMLSelectElement;
  for (const option of select.options) option.selected = true;
  fireEvent.change(select);
  await waitFor(() => {
    const url = String(vi.mocked(apiFetch).mock.calls.at(-1)?.[0]);
    const sp = new URL(url, "http://test").searchParams;
    expect(sp.getAll("clients")).toEqual(["A", "B"]);
    expect(sp.get("affaire")).toBe("École");
    expect(sp.get("agencyId")).toBe("7");
    expect(JSON.parse(sp.get("sorts")!)[0].field).toBe("quantity");
  });
});
