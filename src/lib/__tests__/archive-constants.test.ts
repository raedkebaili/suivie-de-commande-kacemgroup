import { describe, expect, it } from "vitest";
import {
  detectResteColumnIndex,
  detectStateColumnIndex,
  parseArchiveStateFromText,
  parseResteALivrer,
  resolveArchiveRowState,
  resolveArchiveStateSource,
} from "../archive-constants";

describe("archive — règle « cellule vide ≠ 0 » (invariant métier critique)", () => {
  it("une cellule vide ou nulle n'est JAMAIS interprétée comme zéro", () => {
    expect(parseResteALivrer("")).toBeNull();
    expect(parseResteALivrer("   ")).toBeNull();
    expect(parseResteALivrer(null)).toBeNull();
    expect(parseResteALivrer(undefined)).toBeNull();
  });

  it("accepte les formats numériques courants", () => {
    expect(parseResteALivrer("0")).toBe(0);
    expect(parseResteALivrer("0,00")).toBe(0);
    expect(parseResteALivrer("1 234.5")).toBe(1234.5);
    expect(parseResteALivrer("-3")).toBe(-3);
  });

  it("rejette le non numérique", () => {
    expect(parseResteALivrer("abc")).toBeNull();
    expect(parseResteALivrer("12abc")).toBeNull();
  });

  it("n'applique la règle LIVRE que sur un vrai zéro", () => {
    expect(resolveArchiveRowState(null, "")).toBeNull();
    expect(resolveArchiveRowState(null, "0")).toBe("LIVRE");
    expect(resolveArchiveRowState(null, "5")).toBeNull();
  });

  it("respecte la priorité override > fichier > règle automatique", () => {
    expect(resolveArchiveRowState("ANNULE", "0", "LIVRE")).toBe("ANNULE");
    expect(resolveArchiveRowState(null, "0", "PREVISION")).toBe("PREVISION");
    expect(resolveArchiveRowState(null, "0", null)).toBe("LIVRE");
    expect(resolveArchiveStateSource("ANNULE", "0", null)).toBe("manuel");
    expect(resolveArchiveStateSource(null, "0", "LIVRE")).toBe("fichier");
    expect(resolveArchiveStateSource(null, "0", null)).toBe("auto");
    expect(resolveArchiveStateSource(null, "", null)).toBe("aucun");
  });

  it("détecte les états textuels avec tolérance d'accents", () => {
    expect(parseArchiveStateFromText("Livré")).toBe("LIVRE");
    expect(parseArchiveStateFromText("Prévision")).toBe("PREVISION");
    expect(parseArchiveStateFromText("Prêt à livrer")).toBe("PRET_A_LIVRE");
    expect(parseArchiveStateFromText("Annulée")).toBe("ANNULE");
    expect(parseArchiveStateFromText("")).toBeNull();
  });

  it("repère les colonnes État et Reste à livrer", () => {
    const cols = ["Priorité", "Commande", "Reste à livrer", "État"];
    expect(detectResteColumnIndex(cols)).toBe(2);
    expect(detectStateColumnIndex(cols)).toBe(3);
    expect(detectResteColumnIndex(["A", "B"])).toBeNull();
  });
});
