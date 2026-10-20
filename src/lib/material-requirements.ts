/** Règle validée : une unité de chaque matière sélectionnée par article commandé. */
import type { GroupedLine } from "./article-grouping";
export type TechnicalSpec = { categoryKey: string; categoryName: string; materialId: number | null; materialReference: string; materialLabel: string; legacy?: boolean };
export type RequirementCategory = { key: string; name: string; active?: boolean };
export type RequirementLine = GroupedLine & { itemId?: number; groupKey: string; components: TechnicalSpec[] };
export type RequirementFilters = {
  q?: string; articles?: string[]; families?: string[]; powers?: string[]; clients?: string[]; orderNumbers?: string[];
  affaire?: string; dateFrom?: string; dateTo?: string; minQuantity?: string; maxQuantity?: string;
  completeness?: string; technical?: { key: string; text: string; mode: string }[];
  sorts?: { field: string; direction: string }[];
};
const normalized = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
export const specIdentity = (c: TechnicalSpec) => c.materialId != null ? `id:${c.materialId}` : `text:${normalized(c.materialReference)}:${normalized(c.materialLabel)}`;
export function categorySpecs(line: Pick<RequirementLine, "components">, key: string): TechnicalSpec[] {
  const unique = new Map<string, TechnicalSpec>();
  for (const component of line.components || []) if (component.categoryKey === key) unique.set(specIdentity(component), component);
  return [...unique.values()];
}
export const specLabel = (spec: TechnicalSpec) => [spec.materialReference && spec.materialReference !== "SANS-REF" ? spec.materialReference : "", spec.materialLabel].filter(Boolean).join(" — ");
export const categoryLabel = (line: RequirementLine, key: string) => categorySpecs(line, key).map(specLabel).join(" | ");
export function categoryNeed(line: RequirementLine, key: string): number | null {
  const specs = categorySpecs(line, key);
  return specs.length ? line.quantity * specs.length : null;
}
export function filterRequirementLines(lines: RequirementLine[], filters: RequirementFilters, categories: RequirementCategory[]) {
  const contains = (value: unknown, query: string) => normalized(value).includes(normalized(query));
  const selected = (values: string[] | undefined, value: string) => !values?.length || values.includes(value);
  return lines.filter(line => {
    if (!selected(filters.articles, line.articleName) || !selected(filters.families, line.familyCategory || "Non classée") || !selected(filters.powers, line.power === null ? "unknown" : String(line.power)) || !selected(filters.clients, line.clientName || "Non renseigné") || !selected(filters.orderNumbers, line.orderNumber || "Non renseigné")) return false;
    if (filters.q && !contains([line.articleName, line.groupKey, line.familyCategory, line.affaire, line.clientName, line.orderNumber, ...categories.map(c => categoryLabel(line, c.key))].join(" "), filters.q)) return false;
    if (filters.affaire && !contains(line.affaire, filters.affaire)) return false;
    if (filters.dateFrom && (!line.orderDate || line.orderDate.slice(0, 10) < filters.dateFrom)) return false;
    if (filters.dateTo && (!line.orderDate || line.orderDate.slice(0, 10) > filters.dateTo)) return false;
    if (filters.minQuantity && line.quantity < Number(filters.minQuantity)) return false;
    if (filters.maxQuantity && line.quantity > Number(filters.maxQuantity)) return false;
    const missing = categories.some(category => categoryNeed(line, category.key) === null);
    if (filters.completeness === "missing" && !missing) return false;
    if (filters.completeness === "complete" && missing) return false;
    return (filters.technical || []).every(f => f.mode === "missing" ? categoryNeed(line, f.key) === null : f.mode === "present" ? categoryNeed(line, f.key) !== null : contains(categoryLabel(line, f.key), f.text));
  });
}
export function sortRequirementLines(lines: RequirementLine[], sorts: RequirementFilters["sorts"] = []) {
  const rules = sorts.length ? sorts : [{ field: "articleName", direction: "asc" }, { field: "orderNumber", direction: "asc" }];
  const value = (line: RequirementLine, field: string): string | number | null | undefined => {
    if (field.startsWith("total:")) return categoryNeed(line, field.slice(6));
    if (field.startsWith("spec:")) return categoryLabel(line, field.slice(5)) || null;
    return ({ articleName: line.articleName, power: line.power, familyCategory: line.familyCategory, quantity: line.quantity, affaire: line.affaire, clientName: line.clientName, orderNumber: line.orderNumber, orderDate: line.orderDate } as Record<string, string | number | null | undefined>)[field];
  };
  return [...lines].sort((a, b) => {
    for (const rule of rules) {
      const left = value(a, rule.field), right = value(b, rule.field);
      if (left == null || right == null) { if (!(left == null && right == null)) return left == null ? 1 : -1; continue; }
      const cmp = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "fr", { numeric: true, sensitivity: "base" });
      if (cmp) return rule.direction === "desc" ? -cmp : cmp;
    }
    return (a.itemId || 0) - (b.itemId || 0);
  });
}
export function requirementSummary(lines: RequirementLine[], categories: RequirementCategory[]) {
  return categories.map(category => {
    const materials = new Map<string, { reference: string; label: string; quantity: number; legacy: boolean }>();
    let quantity = 0, missingLines = 0;
    for (const line of lines) {
      const specs = categorySpecs(line, category.key);
      if (!specs.length) missingLines++;
      for (const spec of specs) {
        const key = specIdentity(spec), entry = materials.get(key) || { reference: spec.materialReference, label: spec.materialLabel, quantity: 0, legacy: !!spec.legacy };
        entry.quantity += line.quantity; quantity += line.quantity; materials.set(key, entry);
      }
    }
    return { ...category, quantity, missingLines, materials: [...materials.values()].sort((a, b) => a.reference.localeCompare(b.reference, "fr", { numeric: true }) || a.label.localeCompare(b.label, "fr")) };
  });
}
const legacyKeys = ["pcb", "colorTemperature", "lens", "driver", "electricalClass", "accessories", "otherTechSpecs"] as const;
/** Anciennes saisies : un texte non vide est une sélection, jamais découpé arbitrairement. Le dynamique prime par catégorie. */
export function withLegacySpecs(components: TechnicalSpec[], legacy: Record<string, unknown>, categories: RequirementCategory[]): TechnicalSpec[] {
  const result = [...components];
  for (const key of legacyKeys) if (!result.some(c => c.categoryKey === key) && typeof legacy[key] === "string" && String(legacy[key]).trim()) {
    result.push({ categoryKey: key, categoryName: categories.find(c => c.key === key)?.name || key, materialId: null, materialReference: "Saisie ancienne", materialLabel: String(legacy[key]).trim(), legacy: true });
  }
  return result;
}
export function parseRequirementFilters(sp: URLSearchParams): RequirementFilters {
  const parse = (key: string) => { try { return JSON.parse(sp.get(key) || "[]"); } catch { throw new Error(`Filtre ${key} invalide`); } };
  const technical = parse("technical"), sorts = parse("sorts");
  if (!Array.isArray(technical) || technical.length > 200 || technical.some(f => !f || typeof f.key !== "string" || typeof f.text !== "string" || !["contains", "missing", "present"].includes(f.mode))) throw new Error("Filtres techniques invalides");
  if (!Array.isArray(sorts) || sorts.length > 3 || sorts.some(s => !s || typeof s.field !== "string" || !["asc", "desc"].includes(s.direction))) throw new Error("Tri invalide");
  for (const key of ["minQuantity", "maxQuantity"]) if (sp.get(key) && (!Number.isFinite(Number(sp.get(key))) || Number(sp.get(key)) < 0)) throw new Error("Quantité de filtre invalide");
  if (sp.get("minQuantity") && sp.get("maxQuantity") && Number(sp.get("minQuantity")) > Number(sp.get("maxQuantity"))) throw new Error("La quantité minimale dépasse le maximum");
  for (const key of ["dateFrom", "dateTo"]) if (sp.get(key) && (!/^\d{4}-\d{2}-\d{2}$/.test(sp.get(key)!) || !Number.isFinite(Date.parse(sp.get(key)!)) || new Date(sp.get(key)!).toISOString().slice(0, 10) !== sp.get(key))) throw new Error("Date de filtre invalide");
  if (sp.get("dateFrom") && sp.get("dateTo") && sp.get("dateFrom")! > sp.get("dateTo")!) throw new Error("La date de début dépasse la date de fin");
  if (sp.get("completeness") && !["missing", "complete"].includes(sp.get("completeness")!)) throw new Error("Filtre de spécifications invalide");
  return { ...Object.fromEntries(["q", "affaire", "dateFrom", "dateTo", "minQuantity", "maxQuantity", "completeness"].map(k => [k, sp.get(k) || ""])), ...Object.fromEntries(["articles", "families", "powers", "clients", "orderNumbers"].map(k => [k, sp.getAll(k)])), technical, sorts };
}

export type MaterialSummaryFilters = { materialQ?: string; materialCategory?: string; minNeed?: string; maxNeed?: string; materialSort?: string; materialDirection?: string };
/** Filtrage des matières agrégées, sans modifier les articles sources ni les tableaux classiques. */
export function filterMaterialSummary(summary: ReturnType<typeof requirementSummary>, filters: MaterialSummaryFilters) {
  return summary.filter(c => !filters.materialCategory || c.key === filters.materialCategory).map(category => {
    const materials = category.materials.filter(material =>
      (!filters.materialQ || normalized(`${material.reference} ${material.label}`).includes(normalized(filters.materialQ))) &&
      (!filters.minNeed || material.quantity >= Number(filters.minNeed)) &&
      (!filters.maxNeed || material.quantity <= Number(filters.maxNeed)));
    const field = filters.materialSort === "quantity" ? "quantity" : filters.materialSort === "label" ? "label" : "reference";
    materials.sort((a, b) => {
      const cmp = field === "quantity" ? a.quantity - b.quantity : a[field].localeCompare(b[field], "fr", { numeric: true, sensitivity: "base" });
      return (filters.materialDirection === "desc" ? -cmp : cmp) || a.reference.localeCompare(b.reference, "fr");
    });
    return { ...category, materials, quantity: materials.reduce((sum, m) => sum + m.quantity, 0) };
  }).filter(c => c.materials.length > 0);
}
export function parseMaterialSummaryFilters(sp: URLSearchParams): MaterialSummaryFilters {
  for (const key of ["minNeed", "maxNeed"]) if (sp.get(key) && (!Number.isFinite(Number(sp.get(key))) || Number(sp.get(key)) < 0)) throw new Error("Besoin de filtre invalide");
  if (sp.get("minNeed") && sp.get("maxNeed") && Number(sp.get("minNeed")) > Number(sp.get("maxNeed"))) throw new Error("Le besoin minimal dépasse le maximum");
  if (sp.get("materialSort") && !["reference", "label", "quantity"].includes(sp.get("materialSort")!)) throw new Error("Tri matière invalide");
  if (sp.get("materialDirection") && !["asc", "desc"].includes(sp.get("materialDirection")!)) throw new Error("Sens de tri matière invalide");
  return Object.fromEntries(["materialQ", "materialCategory", "minNeed", "maxNeed", "materialSort", "materialDirection"].map(key => [key, sp.get(key) || ""]));
}
