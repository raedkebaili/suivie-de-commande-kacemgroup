import { describe, expect, it } from "vitest";
import { canOpenMobileSection, filterMobileDirectory } from "../mobile-navigation";
import type { Role } from "../types";

const roles: Role[] = ["superadmin", "commercial", "technique", "planification", "consultant_prod", "recouvrement", "acces_agence", "gerant"];
describe("navigation secondaire mobile", () => {
  it("conserve la visibilité des annuaires de la version ordinateur", () => {
    for (const role of roles) {
      expect(canOpenMobileSection(role, "clients")).toBe(["superadmin", "commercial", "recouvrement"].includes(role));
      expect(canOpenMobileSection(role, "agencies")).toBe(["superadmin", "commercial"].includes(role));
    }
  });
  it("permet à chaque rôle de consulter son compte et ses notifications", () => {
    for (const role of roles) {
      expect(canOpenMobileSection(role, "account")).toBe(true);
      expect(canOpenMobileSection(role, "notifications")).toBe(true);
    }
  });
});
describe("recherche annuaire mobile", () => {
  const rows = [
    { name: "Société Éclairage", code: "CL01", contactName: "Amel", phone: "71234567", email: "contact@example.com" },
    { name: "Agence Tunis", code: "AG01", contactName: null, phone: null, email: null },
  ];
  it("ignore les accents, la casse et les espaces extérieurs", () => {
    expect(filterMobileDirectory(rows, " ECLAIRAGE ")).toEqual([rows[0]]);
  });
  it("cherche le code et les coordonnées sans modifier les données", () => {
    for (const query of ["cl01", "amel", "71234567", "contact@example.com"]) {
      expect(filterMobileDirectory(rows, query)).toEqual([rows[0]]);
    }
    expect(rows).toHaveLength(2);
  });
  it("gère les champs absents et les recherches vides ou sans résultat", () => {
    expect(filterMobileDirectory(rows, "")).toEqual(rows);
    expect(filterMobileDirectory(rows, "introuvable")).toEqual([]);
    expect(filterMobileDirectory([], "tunis")).toEqual([]);
  });
});
