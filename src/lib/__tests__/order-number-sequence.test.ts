import { describe, expect, it } from "vitest";
import { getNextOrderSequenceNumber } from "../order-number-sequence";

describe("séquence globale des numéros de commande", () => {
  it("continue après le dernier numéro existant, même si l'année change", () => {
    expect(getNextOrderSequenceNumber(145, 0)).toBe(146);
    expect(getNextOrderSequenceNumber(145, 200)).toBe(201);
    expect(getNextOrderSequenceNumber(0, 0)).toBe(1);
  });
});
