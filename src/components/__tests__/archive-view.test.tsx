// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArchiveView from "../ArchiveView";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/color-context", () => ({ useColors: () => ({ getColor: () => "#ffffff" }) }));
const api = vi.mocked(apiFetch);
const user: User = { id: 1, username: "test", fullName: "Test", role: "commercial" };
const sheets = [
  { id: 11, name: "Janvier", rowCount: 1, sheetIndex: 0 },
  { id: 22, name: "Dernière période", rowCount: 602, sheetIndex: 1 },
];
function data(id: number) {
  const rows = Array.from({ length: id === 22 ? 602 : 1 }, (_, i) => ({ id: id * 10000 + i, rowIndex: i, cells: [`Article ${id}-${i + 1}`], state: null, stateOverride: null, cellColors: {}, updatedByName: null }));
  return { sheet: { clientsColumnIndex: null, affaireColumnIndex: null, stateColumnIndex: null }, columns: [id === 22 ? "Article récent" : "Ancienne désignation"], preamble: [[`Préambule ${id}`]], rows, pagination: { page: 1, pageSize: rows.length, total: rows.length, pages: 1 } };
}
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (url) => {
    if (url === "/api/archive/sheets") return { sheets };
    const params = new URL(url, "http://test").searchParams;
    return data(Number(params.get("sheetId")));
  });
});
afterEach(cleanup);
describe("navigation du classeur d’archive", () => {
  it("ouvre la dernière feuille et affiche plus de 500 lignes sans pagination", async () => {
    render(<ArchiveView user={user} />);
    expect(await screen.findByText("Article 22-602")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Période / feuille" }) as HTMLSelectElement).value).toBe("22");
    expect(api.mock.calls.some(([url]) => url === "/api/archive/rows?sheetId=22&all=1")).toBe(true);
    expect(screen.queryByRole("button", { name: /Suivant/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Précédent/ })).toBeNull();
  });
  it("affiche toutes les feuilles en conservant leurs colonnes et leur préambule", async () => {
    const actions = userEvent.setup();
    render(<ArchiveView user={user} />);
    await screen.findByText("Article 22-602");
    await actions.selectOptions(screen.getByRole("combobox", { name: "Période / feuille" }), "all");
    await screen.findByText("Article 11-1");
    await screen.findByText("Article 22-602");
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(2);
    expect(within(tables[0]).getByRole("columnheader", { name: "Ancienne désignation" })).toBeTruthy();
    expect(within(tables[1]).getByRole("columnheader", { name: "Article récent" })).toBeTruthy();
    expect(screen.getByText("Préambule 11")).toBeTruthy();
    expect(screen.getByText("Préambule 22")).toBeTruthy();
    await actions.click(within(tables[0]).getByRole("button", { name: "✎ Modifier" }));
    expect(screen.getByRole("textbox", { name: "Ancienne désignation" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Article récent" })).toBeNull();
    await actions.click(screen.getByRole("button", { name: "Annuler" }));
    expect(api.mock.calls.filter(([url]) => url === "/api/archive/sheets")).toHaveLength(1);
    await actions.selectOptions(screen.getByRole("combobox", { name: "Période / feuille" }), "11");
    await waitFor(() => expect(screen.getAllByRole("table")).toHaveLength(1));
    expect(await screen.findByText("Article 11-1")).toBeTruthy();
  });
  it("applique la recherche à toutes les feuilles et permet leur actualisation", async () => {
    const actions = userEvent.setup();
    render(<ArchiveView user={user} />);
    await screen.findByText("Article 22-602");
    await actions.selectOptions(screen.getByRole("combobox", { name: "Période / feuille" }), "all");
    await screen.findByText("Article 11-1");
    await actions.type(screen.getByPlaceholderText("🔍 Rechercher dans toutes les feuilles..."), "client");
    await waitFor(() => {
      for (const id of [11, 22]) expect(api.mock.calls.some(([url]) => url === `/api/archive/rows?sheetId=${id}&all=1&q=client`)).toBe(true);
    });
    const before = api.mock.calls.length;
    await actions.click(screen.getByRole("button", { name: "🔄 Actualiser" }));
    await waitFor(() => expect(api.mock.calls.length).toBeGreaterThanOrEqual(before + 2));
  });
});
