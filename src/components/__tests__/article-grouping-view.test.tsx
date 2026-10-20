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
import { filterMaterialSummary, requirementSummary } from "@/lib/material-requirements";
function setupSeparatedTables() {
  const groups = groupArticles([
    { itemId: 1, articleName: "NETLUX 75W", quantity: 10, producedQty: 4, deliveredQty: 2, components: [{ categoryKey: "driver", categoryName: "Driver", materialId: 2, materialReference: "DX", materialLabel: "Driver X" }] },
    { itemId: 2, articleName: "NETLUX 2.0 100W", quantity: 20, producedQty: 9, deliveredQty: 5, components: [{ categoryKey: "driver", categoryName: "Driver", materialId: 3, materialReference: "DY", materialLabel: "Driver Y" }] },
  ]);
  const lines = groups.flatMap(g => g.lines.map(l => ({ ...l, components: l.components || [], groupKey: g.key })));
  const categories = [{ key: "driver", name: "Driver" }];
  const sourceSummary = requirementSummary(lines, categories);
  const totals = { groups: 2, lines: 2, quantity: 30, produced: 13, delivered: 7, remaining: 23 };
  vi.mocked(apiFetch).mockClear().mockImplementation(async url => {
    if (url.startsWith("/api/orders/grouped-articles?")) return { groups, totals } as never;
    const params = new URL(url, "http://test").searchParams;
    return { summary: filterMaterialSummary(sourceSummary, { materialQ: params.get("materialQ") || "", materialCategory: params.get("materialCategory") || "" }), categories, categoryOptions: categories, totals, options: { clients: ["A", "B"], articles: [], families: [], powers: [], orderNumbers: [] } } as never;
  });
}
it("conserve un tableau classique par groupe puis une synthèse distincte en dessous", async () => {
  setupSeparatedTables();
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  const first = await screen.findByRole("table", { name: "Regroupement classique NETLUX" });
  const second = screen.getByRole("table", { name: "Regroupement classique NETLUX 2.0" });
  const synthesis = await screen.findByRole("table", { name: "Synthèse du besoin par catégorie et référence matière" });
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(second.compareDocumentPosition(synthesis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(first).getByRole("columnheader", { name: "Produit" })).toBeTruthy();
  expect(within(first).getByRole("columnheader", { name: "Livré" })).toBeTruthy();
  expect(within(first).queryByRole("columnheader", { name: "Driver" })).toBeNull();
  expect(within(synthesis).getByRole("cell", { name: "Driver X" })).toBeTruthy();
  expect(within(synthesis).getByRole("cell", { name: "Driver Y" })).toBeTruthy();
});
it("la recherche matière ne filtre ni ne recharge les regroupements classiques", async () => {
  setupSeparatedTables();
  render(<ArticleGroupingView filters={{ status: "EN_INSTANCE", agency: "7", priority: "URGENT" }} refreshKey={1} />);
  await screen.findByRole("table", { name: "Regroupement classique NETLUX 2.0" });
  const classicRequests = () => vi.mocked(apiFetch).mock.calls.filter(([url]) => url.startsWith("/api/orders/grouped-articles?")).length;
  const before = classicRequests();
  fireEvent.change(screen.getByLabelText("Recherche matière / référence"), { target: { value: "DX" } });
  await waitFor(() => {
    const table = screen.getByRole("table", { name: "Synthèse du besoin par catégorie et référence matière" });
    expect(within(table).getByRole("cell", { name: "Driver X" })).toBeTruthy();
    expect(within(table).queryByRole("cell", { name: "Driver Y" })).toBeNull();
  });
  expect(screen.getAllByRole("table", { name: /Regroupement classique/ })).toHaveLength(2);
  expect(classicRequests()).toBe(before);
  const lastUrl = String(vi.mocked(apiFetch).mock.calls.at(-1)?.[0]);
  const sp = new URL(lastUrl, "http://test").searchParams;
  expect(sp.get("materialQ")).toBe("DX"); expect(sp.get("agencyId")).toBe("7");
});
it("replier un groupe conserve les autres groupes et la synthèse", async () => {
  setupSeparatedTables();
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  await screen.findByRole("table", { name: "Regroupement classique NETLUX 2.0" });
  fireEvent.click(screen.getByRole("button", { name: /NETLUX 2\.0/ }));
  expect(screen.queryByRole("table", { name: "Regroupement classique NETLUX 2.0" })).toBeNull();
  expect(screen.getByRole("table", { name: "Regroupement classique NETLUX" })).toBeTruthy();
  expect(screen.getByRole("table", { name: "Synthèse du besoin par catégorie et référence matière" })).toBeTruthy();
});
it("une erreur de synthèse ne masque pas les regroupements classiques", async () => {
  setupSeparatedTables();
  const previous = vi.mocked(apiFetch).getMockImplementation()!;
  vi.mocked(apiFetch).mockImplementation((url, options) => url.startsWith("/api/orders/material-requirements?") ? Promise.reject(new Error("Synthèse indisponible")) : previous(url, options));
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  await screen.findByText("Synthèse indisponible");
  expect(screen.getAllByRole("table", { name: /Regroupement classique/ })).toHaveLength(2);
});

import { DEFAULT_GROUPING_COLUMNS } from "@/lib/article-grouping-columns";
function setupColumnConfig(canConfigure = true) {
  setupSeparatedTables();
  const source = vi.mocked(apiFetch).getMockImplementation()!;
  let visibleColumns = [...DEFAULT_GROUPING_COLUMNS];
  vi.mocked(apiFetch).mockImplementation(async (url, options) => {
    if (url === "/api/orders/grouped-articles/columns") {
      if (options?.method === "PUT") visibleColumns = JSON.parse(String(options.body)).visibleColumns;
      return { visibleColumns, canConfigure } as never;
    }
    return source(url, options);
  });
  return { update: (columns: typeof visibleColumns) => { visibleColumns = columns; } };
}
it("l’admin masque les colonnes de tous les groupes sans toucher à la synthèse", async () => {
  setupColumnConfig();
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  fireEvent.click(await screen.findByRole("button", { name: "Colonnes — affichage pour tous" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Produit" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Livré" }));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer pour tous" }));
  await waitFor(() => {
    for (const table of screen.getAllByRole("table", { name: /Regroupement classique/ })) {
      expect(within(table).queryByRole("columnheader", { name: "Produit" })).toBeNull();
      expect(within(table).queryByRole("columnheader", { name: "Livré" })).toBeNull();
      expect(within(table).getAllByRole("columnheader")).toHaveLength(8);
      for (const row of within(table).getAllByRole("row").slice(1)) expect(within(row).getAllByRole("cell")).toHaveLength(8);
    }
  });
  expect(screen.getByRole("table", { name: "Synthèse du besoin par catégorie et référence matière" })).toBeTruthy();
});
it("les autres utilisateurs reçoivent les colonnes communes sans commande d’édition", async () => {
  const config = setupColumnConfig(false); config.update(["quantity"]);
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  const table = await screen.findByRole("table", { name: "Regroupement classique NETLUX" });
  expect(within(table).getAllByRole("columnheader")).toHaveLength(1);
  expect(within(table).getByRole("columnheader", { name: "Commandé" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Colonnes — affichage pour tous" })).toBeNull();
});
it("tout masquer reste réversible et laisse la synthèse visible", async () => {
  setupColumnConfig();
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  fireEvent.click(await screen.findByRole("button", { name: "Colonnes — affichage pour tous" }));
  fireEvent.click(screen.getByRole("button", { name: "Tout masquer" }));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer pour tous" }));
  await waitFor(() => expect(screen.queryAllByRole("table", { name: /Regroupement classique/ })).toHaveLength(0));
  expect(screen.getByRole("table", { name: "Synthèse du besoin par catégorie et référence matière" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Colonnes — affichage pour tous" }));
  fireEvent.click(screen.getByRole("button", { name: "Tout afficher" }));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer pour tous" }));
  await waitFor(() => expect(screen.getAllByRole("table", { name: /Regroupement classique/ })).toHaveLength(2));
});
it("une session ouverte se synchronise au retour sur la page sans recharger les articles", async () => {
  const config = setupColumnConfig(false);
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  const table = await screen.findByRole("table", { name: "Regroupement classique NETLUX" });
  const requests = () => vi.mocked(apiFetch).mock.calls.filter(([url]) => url.startsWith("/api/orders/grouped-articles?")).length;
  const before = requests(); config.update(["articleName"]);
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(within(table).getAllByRole("columnheader")).toHaveLength(1));
  expect(within(table).getByRole("columnheader", { name: "Article" })).toBeTruthy();
  expect(requests()).toBe(before);
});
