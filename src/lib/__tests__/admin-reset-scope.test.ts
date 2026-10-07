import { describe, expect, it } from "vitest";
import {
  buildOrderResetSql,
  ORDER_COUNTER_TABLE,
  ORDER_RESET_TABLES,
  PRESERVED_REFERENCE_TABLES,
} from "../admin-reset-scope";

describe("périmètre du reset administrateur", () => {
  it("réinitialise uniquement les commandes, études et compteur", () => {
    const sql = buildOrderResetSql();
    expect(sql).toContain("photometric_studies");
    expect(sql).toContain("orders");
    expect(sql).toContain("RESTART IDENTITY CASCADE");
    expect(ORDER_RESET_TABLES).toEqual(["photometric_studies", "orders"]);
    expect(ORDER_COUNTER_TABLE).toBe("order_counters");
  });

  it("protège les référentiels nécessaires à la nouvelle saisie", () => {
    expect(PRESERVED_REFERENCE_TABLES).toEqual([
      "matieres",
      "material_categories",
      "clients",
      "agencies",
    ]);
    const sql = buildOrderResetSql();
    for (const table of PRESERVED_REFERENCE_TABLES) expect(sql).not.toContain(table);
  });
});
