import { describe, expect, it } from "vitest";
import {
  canManageOrderColumnVisibility,
  HIDEABLE_ORDER_COLUMNS,
  HIDEABLE_PRODUCTION_STATES,
  parseStoredList,
  sanitizeList,
  toggleListItem,
} from "../order-column-visibility";

/**
 * Règle : une colonne masquée par le superadmin est masquée pour TOUS les utilisateurs.
 * Seul le superadmin peut modifier la configuration globale.
 */
describe("visibilité globale des colonnes des commandes", () => {
  it("seul le superadmin peut modifier la configuration", () => {
    expect(canManageOrderColumnVisibility("superadmin")).toBe(true);
    for (const role of ["commercial", "technique", "planification", "consultant_prod", "recouvrement", "acces_agence", "gerant"]) {
      expect(canManageOrderColumnVisibility(role), role).toBe(false);
    }
    expect(canManageOrderColumnVisibility(undefined)).toBe(false);
    expect(canManageOrderColumnVisibility("")).toBe(false);
  });

  it("garde uniquement les colonnes et états connus", () => {
    expect(sanitizeList(["date", "inconnue", 3, null, "affaire"], HIDEABLE_ORDER_COLUMNS)).toEqual(["date", "affaire"]);
    expect(sanitizeList(["LIVREE", "ANNULEE", "NIMPORTE"], HIDEABLE_PRODUCTION_STATES)).toEqual(["LIVREE", "ANNULEE"]);
  });

  it("supprime les doublons et accepte une valeur non tableau sans erreur", () => {
    expect(sanitizeList(["date", "date"], HIDEABLE_ORDER_COLUMNS)).toEqual(["date"]);
    expect(sanitizeList("date", HIDEABLE_ORDER_COLUMNS)).toEqual([]);
  });

  it("lit la configuration stockée et ignore un JSON invalide", () => {
    expect(parseStoredList('["agence","priorite"]', HIDEABLE_ORDER_COLUMNS)).toEqual(["agence", "priorite"]);
    expect(parseStoredList("{pas du json", HIDEABLE_ORDER_COLUMNS)).toEqual([]);
    expect(parseStoredList(null, HIDEABLE_ORDER_COLUMNS)).toEqual([]);
  });

  it("masque puis réaffiche une colonne sans modifier la liste d'origine", () => {
    const original = ["date"];
    const hidden = toggleListItem(original, "agence");
    expect(hidden).toEqual(["date", "agence"]);
    expect(toggleListItem(hidden, "date")).toEqual(["agence"]);
    expect(original).toEqual(["date"]);
  });
});
