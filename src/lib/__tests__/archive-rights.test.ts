import { describe, expect, it } from "vitest";
import { archiveRightsFor, changedCellIndexes } from "../archive-rights";

describe("archiveRightsFor", () => {
  it("le responsable planification change l'état et les champs", () => {
    expect(archiveRightsFor("planification")).toEqual({ canChangeState: true, canEditCells: true, marksCommercialEdits: false });
  });

  it("le superadmin change l'état et les champs sans marquage commercial", () => {
    expect(archiveRightsFor("superadmin")).toEqual({ canChangeState: true, canEditCells: true, marksCommercialEdits: false });
  });

  it("le responsable technique modifie les champs seulement", () => {
    expect(archiveRightsFor("technique")).toEqual({ canChangeState: false, canEditCells: true, marksCommercialEdits: false });
  });

  it("le commercial modifie les champs, marqués en violet, sans changer l'état", () => {
    expect(archiveRightsFor("commercial")).toEqual({ canChangeState: false, canEditCells: true, marksCommercialEdits: true });
  });

  it("les autres rôles n'ont aucun droit d'édition", () => {
    for (const role of ["gerant", "acces_agence", "recouvrement", "inconnu", null, undefined]) {
      expect(archiveRightsFor(role)).toEqual({ canChangeState: false, canEditCells: false, marksCommercialEdits: false });
    }
  });
});

describe("changedCellIndexes", () => {
  it("retourne uniquement les cellules modifiées", () => {
    expect(changedCellIndexes(["a", "b", "c"], ["a", "B", "c"])).toEqual([1]);
  });

  it("ignore une différence de longueur sans valeur (vide équivalent à absent)", () => {
    expect(changedCellIndexes(["a"], ["a", ""])).toEqual([]);
    expect(changedCellIndexes(["a"], ["a", "x"])).toEqual([1]);
  });

  it("aucune modification retourne une liste vide", () => {
    expect(changedCellIndexes(["x", "y"], ["x", "y"])).toEqual([]);
  });
});
