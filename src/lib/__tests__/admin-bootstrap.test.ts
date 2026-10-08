import { describe, expect, it } from "vitest";
import { initialAdminPasswordError, shouldSeedDefaultUser } from "../admin-bootstrap";

describe("bootstrap du premier administrateur", () => {
  it("ne déclenche le seed que si la table utilisateurs est vide", () => {
    expect(shouldSeedDefaultUser(undefined)).toBe(true);
    expect(shouldSeedDefaultUser(null)).toBe(true);
    expect(shouldSeedDefaultUser({ id: 1 })).toBe(false);
  });

  it("exige un mot de passe initial conforme sans en conserver la valeur", () => {
    expect(initialAdminPasswordError(undefined)).toContain("INITIAL_ADMIN_PASSWORD est requis");
    expect(initialAdminPasswordError("weak-password")).toContain("INITIAL_ADMIN_PASSWORD invalide");
    expect(initialAdminPasswordError("InitialAdmin2026!")).toBeNull();
  });
});
