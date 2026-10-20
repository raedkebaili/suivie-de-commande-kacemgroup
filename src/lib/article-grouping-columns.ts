import type { GroupedLine } from "./article-grouping";
/** Identifiants stables : le réglage concerne le regroupement classique uniquement. */
export const GROUPING_COLUMNS = [
  { key: "articleName", label: "Article", excel: "Article" },
  { key: "power", label: "Puissance", excel: "Puissance (W)" },
  { key: "familyCategory", label: "Famille", excel: "Famille" },
  { key: "quantity", label: "Commandé", excel: "Quantité" },
  { key: "affaire", label: "Affaire", excel: "Affaire" },
  { key: "clientName", label: "Client", excel: "Client" },
  { key: "orderNumber", label: "N° Cmd", excel: "N° Commande" },
  { key: "producedQty", label: "Produit", excel: "Produit" },
  { key: "deliveredQty", label: "Livré", excel: "Livré" },
  { key: "remaining", label: "Reste à livrer", excel: "Reste à livrer" },
] as const;
export type GroupingColumnKey = typeof GROUPING_COLUMNS[number]["key"];
export const DEFAULT_GROUPING_COLUMNS: GroupingColumnKey[] = GROUPING_COLUMNS.map(c => c.key);
export const GROUPING_COLUMNS_SETTING = "article_grouping_visible_columns";
export function validGroupingColumns(value: unknown): value is GroupingColumnKey[] {
  return Array.isArray(value) && value.length <= GROUPING_COLUMNS.length && value.every(key => DEFAULT_GROUPING_COLUMNS.includes(key));
}
export function canonicalGroupingColumns(value: GroupingColumnKey[]): GroupingColumnKey[] {
  return DEFAULT_GROUPING_COLUMNS.filter(key => value.includes(key));
}
export function parseGroupingColumns(value?: string | null): GroupingColumnKey[] {
  try { const parsed: unknown = JSON.parse(value || "null"); return validGroupingColumns(parsed) ? canonicalGroupingColumns(parsed) : [...DEFAULT_GROUPING_COLUMNS]; }
  catch { return [...DEFAULT_GROUPING_COLUMNS]; }
}
export function groupingCell(line: GroupedLine, key: GroupingColumnKey): string | number {
  if (key === "power") return line.power === null ? "—" : `${line.power} W`;
  if (key === "familyCategory") return line.familyCategory || "Non définie dans le catalogue";
  return line[key] ?? "—";
}
/** Les métadonnées de groupe restent dans le fichier ; les colonnes masquées ne sont pas exportées. */
export function filterGroupingExportRow(row: Record<string, unknown>, visible: GroupingColumnKey[], summary = false) {
  const permitted = new Set<string>(["Groupe", "Sous-famille / variante", "Nb variantes", "Nb lignes"]);
  const aliases: Partial<Record<GroupingColumnKey, string>> = { articleName: "Articles du groupe", quantity: "Quantité totale" };
  for (const key of visible) permitted.add((summary && aliases[key]) || GROUPING_COLUMNS.find(c => c.key === key)!.excel);
  return Object.fromEntries(Object.entries(row).filter(([key]) => permitted.has(key)));
}
