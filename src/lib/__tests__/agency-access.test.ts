import { describe, expect, it } from "vitest";
import { agencyScopeForUser } from "../agency-scope";

describe("agencyScopeForUser", () => {
  it("garde le superadmin global", () => {
    expect(agencyScopeForUser({ role: "superadmin", agencyIds: [1] })).toBeNull();
  });

  it("n'applique pas une affectation agence à un autre rôle", () => {
    expect(agencyScopeForUser({ role: "commercial", agencyIds: [1] })).toBeNull();
  });

  it("limite le rôle acces_agence aux agences affectées", () => {
    expect(agencyScopeForUser({ role: "acces_agence", agencyIds: [2, 5] })).toEqual([2, 5]);
  });

  it("ne donne aucune agence au rôle acces_agence sans affectation", () => {
    expect(agencyScopeForUser({ role: "acces_agence" })).toEqual([]);
  });
});
