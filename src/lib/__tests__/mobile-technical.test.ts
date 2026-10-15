import { describe, expect, it } from "vitest";
import { mobileMaterialIds, mobileTechnicalPayload } from "../mobile-technical";
import { orderModalSaveRights } from "../order-modal-permissions";
import type { TechnicalComponent } from "../types";

const component = (materialId: number | null) => ({ materialId }) as TechnicalComponent;
describe("composants techniques sur mobile", () => {
  it("préserve toutes les matières existantes, y compris celles hors catalogue", () => {
    expect(mobileMaterialIds([component(12), component(999), component(12), component(null)])).toEqual([12, 999]);
    expect(mobileMaterialIds()).toEqual([]);
  });
  it("cible un seul article sans champs commerciaux ni anciennes spécifications", () => {
    expect(mobileTechnicalPayload(7, [12, 999, 12])).toEqual({ dynamicTechItems: [{ itemId: 7, materialIds: [12, 999] }] });
  });
  it("permet le retrait explicite de tous les composants", () => {
    expect(mobileTechnicalPayload(7, [])).toEqual({ dynamicTechItems: [{ itemId: 7, materialIds: [] }] });
  });
  it("rejette les identifiants d'article invalides et filtre les matières invalides", () => {
    for (const id of [0, -1, NaN, 1.5]) expect(() => mobileTechnicalPayload(id, [])).toThrow("Article invalide");
    expect(mobileTechnicalPayload(1, [0, -1, NaN, 2.5, 3])).toEqual({ dynamicTechItems: [{ itemId: 1, materialIds: [3] }] });
  });
  it("ne modifie pas la sélection fournie", () => {
    const ids = [4, 4, 6];
    mobileTechnicalPayload(1, ids);
    expect(ids).toEqual([4, 4, 6]);
  });
  it("réutilise les droits techniques existants", () => {
    for (const role of ["superadmin", "technique"]) expect(orderModalSaveRights(role, true).canSaveTechnical).toBe(true);
    for (const role of ["commercial", "planification", "consultant_prod", "recouvrement", "acces_agence", "gerant"]) expect(orderModalSaveRights(role, true).canSaveTechnical).toBe(false);
  });
});
