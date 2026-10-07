import { normalizeImportHeader } from "./order-import-fields";

export const EXCEL_WHITE_FILL = "#FFFFFF";
const EXCEL_PREVISION_FILLS = new Set(["#F97316", "#FFD3AC", "#FFA500"]);

export function normalizeExcelFillColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}([0-9A-F]{2})?$/.test(raw)) return null;
  // Les couleurs Excel ARGB sont généralement codées AARRGGBB.
  return `#${raw.length === 8 ? raw.slice(2) : raw}`;
}

export function isExcelWhiteFill(value: string | null | undefined): boolean {
  return normalizeExcelFillColor(value) === EXCEL_WHITE_FILL;
}

/**
 * Détermine l'état commercial depuis le texte historique et, à défaut,
 * depuis la couleur de remplissage de la ligne.
 * Une cellule explicitement blanche correspond au fond neutre des commandes
 * confirmées dans l'ancien suivi ; elle devient donc BON_COMMANDE.
 */
export function inferCommercialStatusFromExcel(
  rawValue: string | null | undefined,
  fillColor: string | null | undefined,
): "SUR_STOCK" | "BON_COMMANDE" | "PREVISION" {
  const normalized = normalizeImportHeader(rawValue || "");
  if (normalized.includes("stock") || normalized.includes("besoininterne")) return "SUR_STOCK";
  if (normalized.includes("prevision") || normalized.includes("previs")) return "PREVISION";
  if (normalized.includes("boncommande") || normalized.includes("bondecommande") || normalized === "commande" || normalized.includes("commandeconfirmee")) return "BON_COMMANDE";

  const color = normalizeExcelFillColor(fillColor);
  if (color === EXCEL_WHITE_FILL) return "BON_COMMANDE";
  if (color && EXCEL_PREVISION_FILLS.has(color)) return "PREVISION";
  return "PREVISION";
}
