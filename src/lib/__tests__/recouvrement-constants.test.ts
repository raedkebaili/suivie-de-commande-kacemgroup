import { describe, expect, it } from "vitest";
import { DEFAULT_RECOUVREMENT_STATES } from "../recouvrement-constants";

describe("catalogue des états de recouvrement", () => {
  it("ne contient que les deux états métier demandés", () => {
    expect(DEFAULT_RECOUVREMENT_STATES.map((state) => state.label)).toEqual([
      "Retard important",
      "Client Bloqué",
    ]);
  });
});
