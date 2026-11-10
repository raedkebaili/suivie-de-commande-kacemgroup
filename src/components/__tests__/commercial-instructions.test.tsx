// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import CommercialInstructions from "../CommercialInstructions";
import OrderItemRow from "../OrderItemRow";
vi.mock("@/lib/color-context", () => ({ useColors: () => ({ getModifiedCellStyle: () => ({ backgroundColor: "#ffcc00" }), getColor: () => "#ffffff" }) }));
afterEach(cleanup);
const longNeed = `Première consigne commerciale importante.\n${"Respecter les exigences du client et les conditions de montage. ".repeat(80)}\nDernière exigence à ne pas oublier.`;
const longNote = `Livraison avec précaution.\n${"Coordonner la réception avec le responsable avant expédition. ".repeat(80)}\nFin de la note commerciale.`;
function renderRow(clientSpec: string | null = longNeed, note: string | null = longNote, modified = false) {
  return render(<table><tbody><OrderItemRow
    item={{ id: 10, articleName: "Article A", quantity: 12, clientSpec, note }} orderId={1} visualState="neutral"
    modifications={modified ? new Map([["Article A", new Set(["clientSpec", "note"]) ]]) : undefined}
    highlight={text => text} fmtDate={text => text} onShowExpeditionHistory={vi.fn()}
  /></tbody></table>);
}
it("affiche intégralement les deux textes longs sans survol ni action supplémentaire", () => {
  renderRow();
  const need = screen.getByRole("region", { name: /Besoin client.*Article A/ });
  const note = screen.getByRole("region", { name: /Note commerciale.*Article A/ });
  expect(need.querySelector("p")?.textContent).toBe(longNeed);
  expect(note.querySelector("p")?.textContent).toBe(longNote);
  for (const region of [need, note]) {
    const paragraph = region.querySelector("p")!;
    expect(paragraph.className).toContain("whitespace-pre-wrap");
    expect(paragraph.className).toContain("text-[13px]");
    expect(paragraph.style.overflowWrap).toBe("anywhere");
    expect(region.className).not.toMatch(/truncate|line-clamp|max-h-|overflow-hidden/);
    expect(paragraph.className).not.toMatch(/truncate|line-clamp|max-h-|overflow-hidden/);
  }
});
it("place les informations sous l’article sur toute la largeur, en neutralisant le nowrap mobile", () => {
  const { container } = renderRow();
  const rows = container.querySelectorAll("tr");
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelectorAll("td")).toHaveLength(11);
  const fullWidth = rows[1].querySelector("td")!;
  expect(fullWidth.colSpan).toBe(11);
  expect(fullWidth.style.whiteSpace).toBe("normal");
});
it("fournit des liens clavier et tactiles vers le bon bloc, pas de texte caché dans un title", () => {
  renderRow();
  for (const [label, regionLabel] of [["Lire le besoin client de Article A", /Besoin client/], ["Lire la note commerciale de Article A", /Note commerciale/]] as const) {
    const link = screen.getByRole("link", { name: label }) as HTMLAnchorElement;
    expect(document.getElementById(link.hash.slice(1))).toBe(screen.getByRole("region", { name: regionLabel }));
  }
  expect(screen.queryByTitle(longNeed)).toBeNull();
  expect(screen.queryByTitle(longNote)).toBeNull();
});
it("conserve le marquage et la couleur des champs commerciaux modifiés", () => {
  renderRow(longNeed, longNote, true);
  for (const name of [/Besoin client/, /Note commerciale/]) {
    const region = screen.getByRole("region", { name });
    expect(region.style.backgroundColor).toBe("rgb(255, 204, 0)");
    expect(within(region).getByText(/Modifié/)).toBeTruthy();
  }
});
it("ne crée pas de bloc vide pour les champs absents ou composés seulement d’espaces", () => {
  const { container } = renderRow(" \n ", null);
  expect(container.querySelectorAll("tr")).toHaveLength(1);
  expect(screen.queryByRole("region")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});
it("conserve une seule colonne si un seul champ est renseigné et restitue le texte sans interpréter du HTML", () => {
  const text = '<script>alert("test")</script> ' + "REFERENCE".repeat(200);
  const { container } = render(<CommercialInstructions id="single" articleName="Article B" note={text} />);
  expect(screen.getByRole("region").querySelector("p")?.textContent).toBe(text);
  expect(container.querySelector("script")).toBeNull();
  expect(container.firstElementChild?.className).toContain("grid-cols-1");
});
it("applique la surbrillance de recherche aux informations commerciales", () => {
  render(<CommercialInstructions id="search" articleName="Article C" clientSpec="Consigne urgente" highlight={text => <mark>{text}</mark>} />);
  expect(screen.getByRole("region").querySelector("mark")?.textContent).toBe("Consigne urgente");
});
