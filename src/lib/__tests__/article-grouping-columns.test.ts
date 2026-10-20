import { expect, it } from "vitest";
import { DEFAULT_GROUPING_COLUMNS, filterGroupingExportRow, parseGroupingColumns, validGroupingColumns } from "../article-grouping-columns";
it("affiche toutes les colonnes par défaut et conserve une liste explicitement vide", () => {
  for (const input of [undefined, "invalid", "{}", '["inconnue"]']) expect(parseGroupingColumns(input)).toEqual(DEFAULT_GROUPING_COLUMNS);
  expect(parseGroupingColumns("[]")).toEqual([]);
});
it("normalise la configuration sans changer l’ordre des tableaux classiques", () => {
  expect(parseGroupingColumns('["remaining","quantity","quantity"]')).toEqual(["quantity", "remaining"]);
  expect(validGroupingColumns(["quantity", null])).toBe(false);
  expect(validGroupingColumns("quantity")).toBe(false);
});
it("exclut de l’export les colonnes masquées, y compris les totaux par groupe", () => {
  expect(filterGroupingExportRow({ Groupe: "NETLUX", Article: "NETLUX 100W", Quantité: 10, Produit: 5, Livré: 3, "Reste à livrer": 7 }, ["articleName", "quantity"])).toEqual({ Groupe: "NETLUX", Article: "NETLUX 100W", Quantité: 10 });
  expect(filterGroupingExportRow({ Famille: "PUBLIC", "Quantité totale": 10, Produit: 5, "Articles du groupe": "A" }, ["quantity"], true)).toEqual({ "Quantité totale": 10 });
});
