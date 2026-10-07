import { describe, expect, it } from "vitest";
import {
  EXCEL_WHITE_FILL,
  inferCommercialStatusFromExcel,
  inferProductionStatusFromExcel,
  isExcelReadyFill,
  isExcelWhiteFill,
  selectExcelGroupColor,
  normalizeExcelFillColor,
} from "../order-import-colors";

describe("couleurs du fichier Excel pour l'import commandes", () => {
  it("normalise les couleurs RGB et ARGB Excel", () => {
    expect(normalizeExcelFillColor("#ffffff")).toBe(EXCEL_WHITE_FILL);
    expect(normalizeExcelFillColor("FFFFFFFF")).toBe(EXCEL_WHITE_FILL);
    expect(normalizeExcelFillColor("FFFFD3AC")).toBe("#FFD3AC");
    expect(isExcelWhiteFill("FFFFFF")).toBe(true);
    expect(isExcelReadyFill("#FFF700")).toBe(true);
    expect(selectExcelGroupColor(["#FFFFFF", "#FFF700"])).toBe("#FFF700");
  });

  it("donne la priorité à l'état textuel puis utilise le blanc comme bon de commande", () => {
    expect(inferCommercialStatusFromExcel("Prévision", "#FFFFFF")).toBe("PREVISION");
    expect(inferCommercialStatusFromExcel("", "#FFFFFF")).toBe("BON_COMMANDE");
    expect(inferCommercialStatusFromExcel("Bon de commande", null)).toBe("BON_COMMANDE");
    expect(inferCommercialStatusFromExcel("", "#FFD3AC")).toBe("PREVISION");
    expect(inferProductionStatusFromExcel("Annulée", "#FFFFFF")).toBe("ANNULEE");
    expect(inferProductionStatusFromExcel("", "#EF4444")).toBe("ANNULEE");
    expect(inferProductionStatusFromExcel("", "#22C55E")).toBe("LIVREE");
  });
});
