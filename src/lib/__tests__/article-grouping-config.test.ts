import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { readGroupingConfig } from "../article-grouping-config";
vi.mock("@/db", () => ({ db: { select: vi.fn(), selectDistinct: vi.fn() } }));
function setup(value: string | null) {
  vi.mocked(db.select).mockReset().mockReturnValueOnce({ from: async () => [{ id: 1, key: "driver", name: "Drivers actuels", sortOrder: 10, active: true }, { id: 2, key: "old", name: "Ancienne catégorie", active: false, sortOrder: 20 }] } as never)
    .mockReturnValueOnce({ from: () => ({ where: async () => value === null ? [] : [{ value }] }) } as never);
  vi.mocked(db.selectDistinct).mockReturnValue({ from: async () => [{ key: "driver", name: "Ancien nom driver" }, { key: "removed", name: "Catégorie supprimée" }] } as never);
}
beforeEach(() => setup(null));
it("utilise le nom courant et garde les catégories historiques disponibles", async () => {
  const config = await readGroupingConfig();
  expect(config.categories.find(c => c.key === "driver")?.name).toBe("Drivers actuels");
  expect(config.categories.some(c => c.key === "removed")).toBe(true);
  expect(config.selectedKeys).toContain("driver");
  expect(config.selectedKeys).not.toContain("old");
  expect(config.selectedKeys).not.toContain("removed");
});
it("respecte une sélection vide au lieu de réactiver les valeurs par défaut", async () => {
  setup("[]"); expect((await readGroupingConfig()).selectedKeys).toEqual([]);
});
it("préserve l'ordre enregistré et ignore les clés disparues", async () => {
  setup('["old","driver","missing","driver"]'); expect((await readGroupingConfig()).selectedKeys).toEqual(["old", "driver"]);
});
it("récupère les valeurs par défaut si le paramètre est invalide", async () => {
  setup("not-json"); expect((await readGroupingConfig()).selectedKeys).toContain("driver");
});
