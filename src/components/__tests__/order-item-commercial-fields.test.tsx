// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import OrderItemRow from "../OrderItemRow";
vi.mock("@/lib/color-context", () => ({ useColors: () => ({ getModifiedCellStyle: () => ({ backgroundColor: "#ffcc00" }), getColor: () => "#ffffff" }) }));
afterEach(cleanup);
const need = `Début du besoin.\n${"Respecter les exigences de montage du client. ".repeat(60)}\nDernière exigence.`;
const note = `Première note.\n${"Prévenir le responsable avant livraison. ".repeat(60)}\nFin de note.`;
function renderRow(clientSpec: string | null = need, itemNote: string | null = note, modified = false) {
  return render(<table><tbody><OrderItemRow
    item={{ id: 10, articleName: "Article A", quantity: 12, clientSpec, note: itemNote }} orderId={1} visualState="neutral"
    modifications={modified ? new Map([["Article A", new Set(["clientSpec", "note"])]]) : undefined}
    highlight={text => text} fmtDate={text => text} onShowExpeditionHistory={vi.fn()}
  /></tbody></table>);
}
it("conserve une seule ligne et les 11 colonnes originales, avec les textes entiers dans leurs cellules", () => {
  const { container } = renderRow();
  const rows = container.querySelectorAll("tr");
  expect(rows).toHaveLength(1);
  const cells = rows[0].querySelectorAll("td");
  expect(cells).toHaveLength(11);
  expect(cells[7].textContent).toBe(need);
  expect(cells[9].textContent).toBe(note);
  for (const index of [7, 9]) {
    const block = cells[index].querySelector("div")!;
    expect(block.className).toContain("whitespace-pre-wrap");
    expect(block.style.overflowWrap).toBe("anywhere");
    expect(block.className).toContain("w-[200px]");
    expect(cells[index].className + block.className).not.toMatch(/truncate|line-clamp|max-h-|overflow-hidden/);
  }
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("region")).toBeNull();
});
it("conserve la couleur des besoins et notes modifiés sur toute la cellule et le texte", () => {
  const { container } = renderRow(need, note, true);
  const cells = container.querySelectorAll("td");
  for (const index of [7, 9]) {
    expect(cells[index].style.backgroundColor).toBe("rgb(255, 204, 0)");
    expect(cells[index].querySelector("div")?.style.backgroundColor).toBe("rgb(255, 204, 0)");
  }
});
it("n’ajoute aucun bloc lorsque les champs sont vides", () => {
  const { container } = renderRow(" \n ", null);
  const cells = container.querySelectorAll("td");
  expect(cells[7].textContent).toBe("-");
  expect(cells[9].textContent).toBe("-");
  expect(cells[7].querySelector("div")).toBeNull();
  expect(cells[9].querySelector("div")).toBeNull();
});
it("affiche les références sans espaces et le pseudo-HTML comme texte ordinaire", () => {
  const text = '<script>alert("test")</script>' + "REFERENCE".repeat(200);
  const { container } = renderRow(text, text);
  expect(container.querySelectorAll("td")[7].textContent).toBe(text);
  expect(container.querySelectorAll("td")[9].textContent).toBe(text);
  expect(container.querySelector("script")).toBeNull();
});
