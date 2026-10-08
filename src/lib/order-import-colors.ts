import { normalizeImportHeader } from "./order-import-fields";

export const EXCEL_WHITE_FILL = "#FFFFFF";
const EXCEL_PREVISION_FILLS = new Set(["#F97316", "#FFD3AC", "#FFA500"]);
const EXCEL_CANCELLED_FILLS = new Set(["#EF4444", "#FF0000", "#FF2C2C", "#C00000"]);
const EXCEL_DELIVERED_FILLS = new Set(["#22C55E", "#00B050", "#92D050", "#008000"]);
const EXCEL_READY_FILLS = new Set(["#FFFF00", "#FFF700", "#FACC15", "#FFD966", "#FFC000"]);

// Les anciens classeurs utilisent parfois une couleur de thème au lieu d'un
// RGB direct. Cette palette Office standard permet de conserver leur couleur
// au lieu de les faire tomber silencieusement dans PREVISION.
const EXCEL_THEME_COLORS: Record<number, string> = {
  0: "#000000", 1: "#FFFFFF", 2: "#1F497D", 3: "#EEECE1",
  4: "#4F81BD", 5: "#C0504D", 6: "#9BBB59", 7: "#8064A2",
  8: "#4BACC6", 9: "#F79646", 10: "#0000FF", 11: "#800080",
};

function applyExcelTint(hex: string, tint: number): string {
  const raw = hex.slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16));
  const adjusted = channels.map((channel) => Math.round(
    tint < 0 ? channel * (1 + tint) : channel + (255 - channel) * tint,
  ));
  return `#${adjusted.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function normalizeExcelFillColor(value: unknown): string | null {
  if (value && typeof value === "object") {
    const color = value as Record<string, unknown>;
    if (typeof color.rgb === "string") return normalizeExcelFillColor(color.rgb);
    if (typeof color.argb === "string") return normalizeExcelFillColor(color.argb);
    if (typeof color.hex === "string") return normalizeExcelFillColor(color.hex);
    if (typeof color.value === "string") return normalizeExcelFillColor(color.value);
    if (typeof color.theme === "number") {
      const themeColor = EXCEL_THEME_COLORS[color.theme];
      if (themeColor) {
        return typeof color.tint === "number" ? applyExcelTint(themeColor, color.tint) : themeColor;
      }
    }
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

function colorChannels(value: string | null | undefined): [number, number, number] | null {
  const normalized = normalizeExcelFillColor(value);
  if (!normalized) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset + 1, offset + 3), 16)) as [number, number, number];
}

function hueAndSaturation(value: string | null | undefined): { hue: number; saturation: number } | null {
  const channels = colorChannels(value);
  if (!channels) return null;
  const [red, green, blue] = channels.map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0 };
  let hue = 0;
  if (max === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (max === green) hue = 60 * ((blue - red) / delta + 2);
  else hue = 60 * ((red - green) / delta + 4);
  if (hue < 0) hue += 360;
  return { hue, saturation: delta / max };
}

function isRedFill(value: string | null | undefined): boolean {
  const normalized = normalizeExcelFillColor(value);
  if (normalized && EXCEL_CANCELLED_FILLS.has(normalized)) return true;
  const color = hueAndSaturation(value);
  return !!color && color.saturation >= 0.35 && (color.hue <= 18 || color.hue >= 342);
}

function isGreenFill(value: string | null | undefined): boolean {
  const normalized = normalizeExcelFillColor(value);
  if (normalized && EXCEL_DELIVERED_FILLS.has(normalized)) return true;
  const color = hueAndSaturation(value);
  return !!color && color.saturation >= 0.2 && color.hue >= 65 && color.hue <= 175;
}

function isYellowFill(value: string | null | undefined): boolean {
  const normalized = normalizeExcelFillColor(value);
  if (normalized && EXCEL_READY_FILLS.has(normalized)) return true;
  const color = hueAndSaturation(value);
  return !!color && color.saturation >= 0.35 && color.hue > 35 && color.hue < 65;
}

function isOrangeFill(value: string | null | undefined): boolean {
  const normalized = normalizeExcelFillColor(value);
  if (normalized && EXCEL_PREVISION_FILLS.has(normalized)) return true;
  const color = hueAndSaturation(value);
  return !!color && color.saturation >= 0.25 && color.hue >= 15 && color.hue <= 45;
}

export function isExcelWhiteFill(value: string | null | undefined): boolean {
  return normalizeExcelFillColor(value) === EXCEL_WHITE_FILL;
}

export function isExcelReadyFill(value: string | null | undefined): boolean {
  return isYellowFill(value);
}

export function isExcelDeliveredFill(value: string | null | undefined): boolean {
  return isGreenFill(value);
}

/**
 * Détermine l'état commercial depuis le texte historique puis la couleur de
 * remplissage de la ligne. Le blanc explicite reste le fond neutre historique
 * des bons de commande ; il ne doit pas devenir PREVISION par défaut.
 */
export function inferCommercialStatusFromExcel(
  rawValue: string | null | undefined,
  fillColor: string | null | undefined,
): "SUR_STOCK" | "BON_COMMANDE" | "PREVISION" {
  const normalized = normalizeImportHeader(rawValue || "");
  if (normalized.includes("stock") || normalized.includes("besoininterne")) return "SUR_STOCK";
  if (normalized.includes("prevision") || normalized.includes("previs")) return "PREVISION";
  if (normalized.includes("boncommande") || normalized.includes("bondecommande") || normalized === "commande" || normalized.includes("commandeconfirmee")) return "BON_COMMANDE";

  if (isExcelWhiteFill(fillColor) || isOrangeFill(fillColor)) return isOrangeFill(fillColor) ? "PREVISION" : "BON_COMMANDE";
  if (isYellowFill(fillColor) || isGreenFill(fillColor) || isRedFill(fillColor)) return "BON_COMMANDE";
  return "PREVISION";
}

export function selectExcelGroupColor(colors: (string | null | undefined)[]): string | null {
  const normalized = colors.map((color) => normalizeExcelFillColor(color)).filter((color): color is string => color !== null);
  for (const matcher of [isRedFill, isGreenFill, isYellowFill, isOrangeFill]) {
    const match = normalized.find((color) => matcher(color));
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

  if (isRedFill(fillColor)) return "ANNULEE";
  if (isGreenFill(fillColor)) return "LIVREE";
  if (isYellowFill(fillColor)) return "EN_PRODUCTION";
  return "EN_INSTANCE";
}
