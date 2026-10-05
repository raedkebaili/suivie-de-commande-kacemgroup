import { describe, expect, it } from "vitest";
import {
  isNumericPriority,
  priorityColorKey,
  priorityFromLevel,
  priorityLabel,
  priorityLevel,
  prioritySortRank,
} from "../priority";

describe("priority — file P1…P10 + héritage (non-régression métier)", () => {
  it("reconnaît les priorités numérotées", () => {
    expect(isNumericPriority("P1")).toBe(true);
    expect(isNumericPriority("P10")).toBe(true);
    expect(isNumericPriority("NORMALE")).toBe(false);
    expect(isNumericPriority("URGENTE")).toBe(false);
    expect(isNumericPriority(null)).toBe(false);
  });

  it("extrait le niveau numérique", () => {
    expect(priorityLevel("P1")).toBe(1);
    expect(priorityLevel("P10")).toBe(10);
    expect(priorityLevel("NORMALE")).toBeNull();
    expect(priorityLevel(undefined)).toBeNull();
  });

  it("reconstruit une clé depuis un niveau, avec bornes", () => {
    expect(priorityFromLevel(1)).toBe("P1");
    expect(priorityFromLevel(10)).toBe("P10");
    expect(priorityFromLevel(0)).toBeNull();
    expect(priorityFromLevel(11)).toBeNull();
    expect(priorityFromLevel(NaN)).toBeNull();
  });

  it("conserve les libellés historiques", () => {
    expect(priorityLabel("URGENTE")).toBe("Urgente");
    expect(priorityLabel("TRES_URGENTE")).toBe("Très Urgente");
    expect(priorityLabel("P3")).toBe("Priorité 3");
    expect(priorityLabel(null)).toBe("Normale");
  });

  it("ordonne : P1 en premier, puis P10, héritées, Normale à la fin", () => {
    expect(prioritySortRank("P1")).toBe(1);
    expect(prioritySortRank("P10")).toBe(10);
    expect(prioritySortRank("TRES_URGENTE")).toBeLessThan(prioritySortRank("P1"));
    expect(prioritySortRank("URGENTE")).toBeLessThan(prioritySortRank("P1"));
    expect(prioritySortRank("NORMALE")).toBe(999);
    expect(prioritySortRank("P2")).toBeLessThan(prioritySortRank("P3"));
  });

  it("mappe les clés de couleur sans collision héritage / numérotée", () => {
    expect(priorityColorKey("P1")).toBe("PRIORITY_P1");
    expect(priorityColorKey("URGENTE")).toBe("PRIORITY_URGENTE");
    expect(priorityColorKey("TRES_URGENTE")).toBe("PRIORITY_TRES_URGENTE");
    expect(priorityColorKey("NORMALE")).toBe("PRIORITY_NORMALE");
  });
});
