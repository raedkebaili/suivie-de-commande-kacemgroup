import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "../route";
import { db } from "@/db";
import { getUserFromHeaders } from "@/lib/auth";
import { readGroupingConfig } from "@/lib/article-grouping-config";
const { values, conflict } = vi.hoisted(() => ({ values: vi.fn(), conflict: vi.fn() }));
vi.mock("@/db", () => ({ db: { insert: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn() }));
vi.mock("@/lib/article-grouping-config", () => ({ GROUPING_CATEGORIES_SETTING: "article_grouping_categories", readGroupingConfig: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserFromHeaders).mockResolvedValue({ id: 1, role: "superadmin", fullName: "Admin" } as never);
  vi.mocked(readGroupingConfig).mockResolvedValue({ categories: [{ key: "driver", name: "Driver" }, { key: "pcb", name: "PCB" }], selectedKeys: ["driver"], current: [] });
  conflict.mockResolvedValue({}); values.mockReturnValue({ onConflictDoUpdate: conflict });
  vi.mocked(db.insert).mockReturnValue({ values } as never);
});
const request = (selectedKeys: unknown) => new NextRequest("http://test/api/orders/grouped-articles/config", { method: "PUT", body: JSON.stringify({ selectedKeys }) });
it("réserve la modification à l'administrateur système", async () => {
  vi.mocked(getUserFromHeaders).mockResolvedValueOnce(null);
  expect((await PUT(request([]))).status).toBe(401);
  for (const role of ["technique", "commercial", "acces_agence"]) {
    vi.mocked(getUserFromHeaders).mockResolvedValueOnce({ id: 2, role } as never);
    expect((await PUT(request([]))).status).toBe(403);
  }
  expect(db.insert).not.toHaveBeenCalled(); expect(readGroupingConfig).not.toHaveBeenCalled();
});
it("enregistre le choix partagé et son ordre sans doublons", async () => {
  const response = await PUT(request(["pcb", "driver", "pcb"]));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ selectedKeys: ["pcb", "driver"] });
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ key: "article_grouping_categories", value: '["pcb","driver"]', updatedById: 1 }));
});
it("accepte une sélection explicitement vide", async () => {
  expect((await PUT(request([]))).status).toBe(200);
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ value: "[]" }));
});
it("refuse les formes invalides et les catégories inconnues", async () => {
  for (const value of [null, "driver", [123], ["inconnue"]]) expect((await PUT(request(value))).status).toBe(400);
  expect(db.insert).not.toHaveBeenCalled();
});
