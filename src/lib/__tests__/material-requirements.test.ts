import { describe, expect, it } from "vitest";
import { groupArticles } from "../article-grouping";
import { categoryNeed, categorySpecs, filterRequirementLines, parseRequirementFilters, requirementSummary, sortRequirementLines, withLegacySpecs, type RequirementLine, type TechnicalSpec } from "../material-requirements";
const categories = [{ key: "driver", name: "Driver" }, { key: "pcb", name: "PCB" }];
const component = (id: number, categoryKey = "driver"): TechnicalSpec => ({ materialId: id, categoryKey, categoryName: categoryKey, materialReference: `REF-${id}`, materialLabel: `Matière ${id}` });
function line(quantity = 100, components: TechnicalSpec[] = [component(1)], overrides: Partial<RequirementLine> = {}): RequirementLine {
  const grouped = groupArticles([{ articleName: "NETLUX 100 W", quantity }])[0].lines[0];
  return { ...grouped, itemId: 1, groupKey: "NETLUX", orderNumber: "CMD-2", clientName: "Client A", orderDate: "2026-10-20", ...overrides, components };
}
describe("besoin matière", () => {
  it("multiplie les sélections distinctes par la quantité commandée", () => {
    const row = line(100, [component(1), component(2), component(1)]);
    expect(categoryNeed(row, "driver")).toBe(200);
    expect(categorySpecs(row, "driver")).toHaveLength(2);
    expect(categoryNeed(row, "pcb")).toBeNull();
  });
  it("ne déduit ni production ni livraison ni stock", () => {
    expect(categoryNeed(line(100, [component(1)], { producedQty: 90, deliveredQty: 80 }), "driver")).toBe(100);
  });
  it("sépare les références et les catégories, signale les données manquantes", () => {
    const result = requirementSummary([line(100, [component(1), component(2), component(3, "pcb")]), line(20, [component(1)]), line(10, [])], categories);
    expect(result[0]).toMatchObject({ quantity: 220, missingLines: 1 });
    expect(result[0].materials.map(m => m.quantity)).toEqual([120, 100]);
    expect(result[1]).toMatchObject({ quantity: 100, missingLines: 2 });
  });
  it("garde les articles / commandes distincts même à désignation identique", () => {
    const result = requirementSummary([line(5, [component(1)], { itemId: 1 }), line(20, [component(2)], { itemId: 2 })], categories);
    expect(result[0].materials.map(m => m.quantity)).toEqual([5, 20]);
  });
  it("ne confond pas absence de saisie et besoin nul pour une quantité zéro", () => {
    expect(categoryNeed(line(0), "driver")).toBe(0);
    expect(categoryNeed(line(0, []), "driver")).toBeNull();
  });
  it("le composant dynamique prime sur le texte ancien de sa catégorie", () => {
    const specs = withLegacySpecs([component(1)], { driver: "Ancien driver", pcb: "Ancien PCB", lens: " " }, categories);
    expect(specs).toHaveLength(2);
    expect(specs.filter(c => c.categoryKey === "driver")).toHaveLength(1);
    expect(specs[1]).toMatchObject({ materialLabel: "Ancien PCB", legacy: true });
  });
  it("ne découpe pas arbitrairement les saisies anciennes contenant des virgules", () => {
    const specs = withLegacySpecs([], { driver: "Driver A, caractéristique B" }, categories);
    expect(categoryNeed(line(10, specs), "driver")).toBe(10);
  });
  it("combine les filtres par ET et les choix d'un filtre par OU", () => {
    const rows = [line(), line(10, [component(2)], { itemId: 2, clientName: "Client B", affaire: "École" })];
    const filtered = filterRequirementLines(rows, { clients: ["Client A", "Client B"], affaire: "ecole", minQuantity: "5", technical: [{ key: "driver", mode: "contains", text: "REF-2" }] }, categories);
    expect(filtered.map(l => l.itemId)).toEqual([2]);
    expect(requirementSummary(filtered, categories)[0].quantity).toBe(10);
  });
  it("recherche les matières, sans tenir compte des accents / casse", () => {
    expect(filterRequirementLines([line()], { q: "MATIERE 1" }, categories)).toHaveLength(1);
    expect(filterRequirementLines([line()], { q: "absent" }, categories)).toHaveLength(0);
  });
  it("filtre les puissances inconnues, dates, références multiples, et présence technique", () => {
    const rows = [line(), line(20, [], { power: null, orderDate: null, orderNumber: "CMD-1" })];
    expect(filterRequirementLines(rows, { powers: ["unknown"], orderNumbers: ["CMD-1", "CMD-9"] }, categories)).toHaveLength(1);
    expect(filterRequirementLines(rows, { dateFrom: "2026-10-20", dateTo: "2026-10-20" }, categories)).toHaveLength(1);
    expect(filterRequirementLines(rows, { completeness: "complete" }, categories)).toHaveLength(0);
    expect(filterRequirementLines(rows, { technical: [{ key: "driver", text: "", mode: "missing" }] }, categories)).toHaveLength(1);
    expect(filterRequirementLines(rows, { technical: [{ key: "driver", text: "", mode: "present" }] }, categories)).toHaveLength(1);
  });
  it("trie numériquement et par plusieurs niveaux, inconnus toujours en dernier", () => {
    const rows = [line(2, [], { itemId: 1, power: null }), line(10, [component(1)], { itemId: 2, power: 100 }), line(100, [component(1)], { itemId: 3, power: 100 })];
    expect(sortRequirementLines(rows, [{ field: "power", direction: "desc" }, { field: "quantity", direction: "desc" }]).map(l => l.itemId)).toEqual([3, 2, 1]);
    expect(sortRequirementLines(rows, [{ field: "total:driver", direction: "asc" }]).map(l => l.itemId)).toEqual([2, 3, 1]);
  });
  it("accepte une sélection vide sans inventer des besoins", () => {
    expect(requirementSummary([line()], [])).toEqual([]);
    expect(filterRequirementLines([line()], { completeness: "missing" }, [])).toEqual([]);
  });
  it("valide les plages de filtres et les structures de tri", () => {
    expect(parseRequirementFilters(new URLSearchParams("clients=A&clients=B")).clients).toEqual(["A", "B"]);
    for (const query of ["sorts=oops", 'sorts={}', 'technical=[null]', "minQuantity=NaN", "dateFrom=2026-02-30", "dateFrom=2026-11-01&dateTo=2026-10-01", "minQuantity=5&maxQuantity=2", "completeness=bad"]) expect(() => parseRequirementFilters(new URLSearchParams(query))).toThrow();
  });
});
