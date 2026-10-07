import { describe, expect, it } from "vitest";
import {
  EXCEL_WHITE_FILL,
  inferCommercialStatusFromExcel,
  isExcelWhiteFill,
  normalizeExcelFillColor,
} from "../order-import-colors";

describe("couleurs du fichier Excel pour l'import commandes", () => {
  it("normalise les couleurs RGB et ARGB Excel", () => {
    expect(normalizeExcelFillColor("#ffffff")).toBe(EXCEL_WHITE_FILL);
    expect(normalizeExcelFillColor("FFFFFFFF")).toBe(EXCEL_WHITE_FILL);
    expect(normalizeExcelFillColor("FFFFD3AC")).toBe("#FFD3AC");
    expect(isExcelWhiteFill("FFFFFF")).toBe(true);
  });

  it("donne la priorité à l'état textuel puis utilise le blanc comme bon de commande", () => {
    expect(inferCommercialStatusFromExcel("Prévision", "#FFFFFF")).toBe("PREVISION");
    expect(inferCommercialStatusFromExcel("", "#FFFFFF")).toBe("BON_COMMANDE");
    expect(inferCommercialStatusFromExcel("Bon de commande", null)).toBe("BON_COMMANDE");
    expect(inferCommercialStatusFromExcel("", "#FFD3AC")).toBe("PREVISION");
  });
});
