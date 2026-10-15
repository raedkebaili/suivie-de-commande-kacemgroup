import { describe, expect, it } from "vitest";
import { normalizeImportHeader, parseFamilyImportRows } from "../article-family-import";

describe("import Excel des familles — parseur", () => {
  it("reconnaît les en-têtes quelle que soit leur écriture", () => {
    expect(normalizeImportHeader("Sous-Famille")).toBe("sousfamille");
    const { lines, errors } = parseFamilyImportRows([
      { "famille": "PROJECTEUR LED", "Sous famille": "APOLO", "variante": "+" },
      { "FAMILLE": "LUMINAIRE DE STYLE", "SOUS FAMILLE": "TOKYO", "VARIANTE": "" },
    ]);
    expect(errors).toEqual([]);
    expect(lines.map((l) => l.entry)).toEqual([
      { category: "PROJECTEUR LED", subFamily: "APOLO", variant: "+" },
      { category: "LUMINAIRE DE STYLE", subFamily: "TOKYO", variant: "" },
    ]);
  });

  it("lit la colonne DESIGNATION pour affecter un article", () => {
    const { lines } = parseFamilyImportRows([
      { FAMILLE: "LUMINAIRE D'ECLAIRAGE PUBLIQUE", "SOUS FAMILLE": "NETLUX", VARIANTE: "2.0", DESIGNATION: "NETLUX 2 100 W" },
    ]);
    expect(lines[0].designation).toBe("NETLUX 2 100 W");
  });

  it("refuse tout l'import si une ligne est incomplète (pas d'écriture partielle)", () => {
    const { lines, errors } = parseFamilyImportRows([
      { FAMILLE: "POTEAU DE STYLE", "SOUS FAMILLE": "POTEAU", VARIANTE: "4m" },
      { FAMILLE: "POTEAU DE STYLE", "SOUS FAMILLE": "", VARIANTE: "3m" },
    ]);
    expect(lines).toEqual([]);
    expect(errors).toEqual(["Ligne 3 : La sous-famille est obligatoire"]);
  });

  it("détecte deux lignes qui définissent le même libellé de famille", () => {
    const { errors } = parseFamilyImportRows([
      { FAMILLE: "PROJECTEUR LED", "SOUS FAMILLE": "APOLO", VARIANTE: "" },
      { FAMILLE: "PROJECTEUR LED", "SOUS FAMILLE": "apolo", VARIANTE: "" },
    ]);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("déjà présent à la ligne 2");
  });

  it("détecte une désignation présente deux fois dans le fichier", () => {
    const { errors } = parseFamilyImportRows([
      { FAMILLE: "LUMINAIRE DE STYLE", "SOUS FAMILLE": "VENUS", DESIGNATION: "VENUS 100 W" },
      { FAMILLE: "LUMINAIRE DE STYLE", "SOUS FAMILLE": "CELIA", DESIGNATION: "VENUS 100 W" },
    ]);
    expect(errors[0]).toContain("VENUS 100 W");
  });

  it("refuse un fichier vide", () => {
    expect(parseFamilyImportRows([]).errors).toEqual(["Aucune ligne exploitable trouvée"]);
  });
});
