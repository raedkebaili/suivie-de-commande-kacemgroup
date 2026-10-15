import { describe, expect, it } from "vitest";
import { GERANT_ALLOWED_TABS, GERANT_ROLE, isGerantAllowedTab } from "../gerant-access";
import { ROLE_LABELS } from "../types";

describe("rôle Gérant", () => {
  it("utilise une valeur interne stable et le libellé demandé", () => {
    expect(GERANT_ROLE).toBe("gerant");
    expect(ROLE_LABELS[GERANT_ROLE]).toBe("Gérant");
  });

  it("autorise exactement les onglets de consultation prévus", () => {
    expect([...GERANT_ALLOWED_TABS]).toEqual([
      "orders",
      "archive",
      "planning",
      "expedition",
      "expeditionPlanning",
      "watchdog",
      "storage",
      "telegestion",
    ]);
    expect(isGerantAllowedTab("orders")).toBe(true);
    expect(isGerantAllowedTab("users")).toBe(false);
    expect(isGerantAllowedTab("recouvrement")).toBe(false);
  });
});
