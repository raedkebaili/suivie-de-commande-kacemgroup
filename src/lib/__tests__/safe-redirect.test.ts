import { describe, expect, it } from "vitest";
import { safeNextPath } from "../safe-redirect";

describe("safeNextPath — retour après connexion", () => {
  it("accepte les chemins internes", () => {
    expect(safeNextPath("/mobile")).toBe("/mobile");
    expect(safeNextPath("/mobile?tab=orders")).toBe("/mobile?tab=orders");
  });
  it("refuse les redirections externes et les astuces courantes", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("/a\nb")).toBe("/");
  });
  it("valeur absente → accueil", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined, "/mobile")).toBe("/mobile");
  });
});
