// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArchiveView from "../ArchiveView";
import { apiFetch } from "@/lib/api";
import { DEFAULT_COLORS } from "@/lib/color-utils";
import type { User } from "@/lib/types";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/color-context", () => ({ useColors: () => ({ getColor: (key: string) => key === "ARCHIVE_STATE_LIVRE" ? "#22c55e" : DEFAULT_COLORS.find(color => color.key === key)?.color || "#808080" }) }));
const user: User = { id: 1, username: "test", fullName: "Test", role: "planification" };
let selectedState: string | null;
beforeEach(() => {
  selectedState = null;
  vi.mocked(apiFetch).mockReset().mockImplementation(async (url, options) => {
    if (url === "/api/archive/sheets") return { sheets: [{ id: 1, name: "Archive", rowCount: 1 }] };
    if (options?.method === "PUT") {
      selectedState = JSON.parse(String(options.body)).state;
      return { row: { stateOverride: selectedState, state: selectedState || "LIVRE" } };
    }
    return { sheet: { resteColumnIndex: 3 }, columns: ["Article", "Champ modifié", "Couleur personnalisée", "Reste à livrer"], preamble: [],
      rows: [{ id: 88, rowIndex: 0, cells: ["Luminaire", "Modifié", "Personnalisé", "0"], stateOverride: selectedState,
        state: selectedState || "LIVRE", cellColors: { 1: "#3b82f6", 2: "#f97316" }, modifiedColumns: [1] }],
      pagination: { total: 1, pages: 1, page: 1, pageSize: 1 } };
  });
});
afterEach(() => { cleanup(); document.documentElement.classList.remove("dark"); });
it.each([false, true])("le choix Bon de commande blanchit la ligne sans changer les couleurs des cellules (sombre=%s)", async dark => {
  if (dark) document.documentElement.classList.add("dark");
  const actions = userEvent.setup();
  render(<ArchiveView user={user} />);
  const row = (await screen.findByText("Luminaire")).closest("tr")!;
  expect(row.style.backgroundColor).toBe("rgb(34, 197, 94)");
  await actions.selectOptions(within(row).getByRole("combobox"), "BON_COMMANDE");
  await waitFor(() => expect(selectedState).toBe("BON_COMMANDE"));
  function assertColors() {
    const currentRow = screen.getByText("Luminaire").closest("tr")!;
    expect(currentRow.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(within(currentRow).getByText("Modifié").closest("td")!.style.backgroundColor).toBe("rgb(157, 0, 255)");
    expect(within(currentRow).getByText("Personnalisé").closest("td")!.style.backgroundColor).toBe("rgb(249, 115, 22)");
  }
  assertColors();
  const mutation = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "PUT");
  expect(mutation?.[0]).toBe("/api/archive/rows/88");
  expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({ state: "BON_COMMANDE" });
  await actions.click(screen.getByRole("button", { name: "🔄 Actualiser" }));
  await screen.findByText("Luminaire"); assertColors();
  await actions.selectOptions(within(screen.getByText("Luminaire").closest("tr")!).getByRole("combobox"), "");
  await waitFor(() => expect(selectedState).toBeNull());
  expect(screen.getByText("Luminaire").closest("tr")!.style.backgroundColor).toBe("rgb(34, 197, 94)");
  expect(screen.getByText("Modifié").closest("td")!.style.backgroundColor).toBe("rgb(157, 0, 255)");
});
