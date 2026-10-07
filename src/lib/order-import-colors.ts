import { normalizeImportHeader } from "./order-import-fields";

export const EXCEL_WHITE_FILL = "#FFFFFF";
const EXCEL_PREVISION_FILLS = new Set(["#F97316", "#FFD3AC", "#FFA500"]);
const EXCEL_CANCELLED_FILLS = new Set(["#EF4444", "#FF0000", "#FF2C2C", "#C00000"]);
const EXCEL_DELIVERED_FILLS = new Set(["#22C55E", "#00B050", "#92D050", "#008000"]);
const EXCEL_READY_FILLS = new Set(["#FFFF00", "#FFF700", "#FACC15", "#FFD966", "#FFC000"]);

export function normalizeExcelFillColor(value: unknown): string | null {
  if (value && typeof value === "object") {
    const color = value as Record<string, unknown>;
    if (typeof color.rgb === "string") return normalizeExcelFillColor(color.rgb);
    if (typeof color.argb === "string") return normalizeExcelFillColor(color.argb);
    if (typeof color.hex === "string") return normalizeExcelFillColor(color.hex);
    if (typeof color.value === "string") return normalizeExcelFillColor(color.value);
    if (typeof color.indexed === "number") {
      const indexedColors: Record<number, string> = {
        0: "#000000", 1: "#FFFFFF", 2: "#FF0000", 3: "#00FF00", 4: "#0000FF", 5: "#FFFF00", 6: "#FF00FF", 7: "#00FFFF",
        8: "#000000", 9: "#FFFFFF", 10: "#FF0000", 11: "#00FF00", 12: "#0000FF", 13: "#FFFF00", 14: "#FF00FF", 15: "#00FFFF",
      };
      return indexedColors[color.indexed] || null;
    }
    return null;
  }
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}([0-9A-F]{2})?$/.test(raw)) return null;
  // Les couleurs Excel ARGB sont généralement codées AARRGGBB.
  return `#${raw.length === 8 ? raw.slice(2) : raw}`;
}

export function isExcelWhiteFill(value: string | null | undefined): boolean {
  return normalizeExcelFillColor(value) === EXCEL_WHITE_FILL;
}

export function isExcelReadyFill(value: string | null | undefined): boolean {
  const color = normalizeExcelFillColor(value);
  return color !== null && EXCEL_READY_FILLS.has(color);
}

export function isExcelDeliveredFill(value: string | null | undefined): boolean {
  const color = normalizeExcelFillColor(value);
  return color !== null && EXCEL_DELIVERED_FILLS.has(color);
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
  if (color && (EXCEL_READY_FILLS.has(color) || EXCEL_DELIVERED_FILLS.has(color) || EXCEL_CANCELLED_FILLS.has(color))) return "BON_COMMANDE";
  return "PREVISION";
}

export function selectExcelGroupColor(colors: (string | null | undefined)[]): string | null {
  const normalized = colors.map((color) => normalizeExcelFillColor(color)).filter((color): color is string => color !== null);
  for (const palette of [EXCEL_CANCELLED_FILLS, EXCEL_DELIVERED_FILLS, EXCEL_READY_FILLS, EXCEL_PREVISION_FILLS]) {
    const match = normalized.find((color) => palette.has(color));
    if (match) return match;
  }
  return normalized.find((color) => color === EXCEL_WHITE_FILL) || normalized[0] || null;
}

export function inferProductionStatusFromExcel(
  rawValue: string | null | undefined,
  fillColor: string | null | undefined,
): "EN_INSTANCE" | "EN_PRODUCTION" | "LIVREE" | "ANNULEE" {
  const normalized = normalizeImportHeader(rawValue || "");
  if (normalized.includes("annul")) return "ANNULEE";
  if (normalized.includes("livr") || normalized.includes("termine") || normalized.includes("solde")) return "LIVREE";
  if (normalized.includes("production") || normalized.includes("cours")) return "EN_PRODUCTION";

  const color = normalizeExcelFillColor(fillColor);
  if (color && EXCEL_CANCELLED_FILLS.has(color)) return "ANNULEE";
  if (color && EXCEL_DELIVERED_FILLS.has(color)) return "LIVREE";
  if (color && EXCEL_READY_FILLS.has(color)) return "EN_PRODUCTION";
  return "EN_INSTANCE";
}
