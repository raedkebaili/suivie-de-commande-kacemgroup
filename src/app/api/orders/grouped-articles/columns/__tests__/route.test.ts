import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "../route";
import { db } from "@/db";
import { getUserFromHeaders } from "@/lib/auth";
import { readGroupingColumns } from "@/lib/article-grouping-columns-server";
import { DEFAULT_GROUPING_COLUMNS } from "@/lib/article-grouping-columns";
const { values, conflict } = vi.hoisted(() => ({ values: vi.fn(), conflict: vi.fn() }));
vi.mock("@/db", () => ({ db: { insert: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn() }));
vi.mock("@/lib/article-grouping-columns-server", () => ({ readGroupingColumns: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserFromHeaders).mockResolvedValue({ id: 1, role: "superadmin", fullName: "Admin" } as never);
  vi.mocked(readGroupingColumns).mockResolvedValue([...DEFAULT_GROUPING_COLUMNS]);
  conflict.mockResolvedValue({}); values.mockReturnValue({ onConflictDoUpdate: conflict });
  vi.mocked(db.insert).mockReturnValue({ values } as never);
});
const request = (visibleColumns: unknown) => new NextRequest("http://test/api/orders/grouped-articles/columns", { method: "PUT", body: JSON.stringify({ visibleColumns }) });
it("autorise la lecture commune mais réserve la modification au superadmin", async () => {
  vi.mocked(getUserFromHeaders).mockResolvedValueOnce(null);
  expect((await GET(request([]))).status).toBe(401);
  for (const role of ["commercial", "technique", "acces_agence", "gerant"]) {
    vi.mocked(getUserFromHeaders).mockResolvedValueOnce({ role } as never);
    const response = await GET(request([]));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ visibleColumns: DEFAULT_GROUPING_COLUMNS, canConfigure: false });
    vi.mocked(getUserFromHeaders).mockResolvedValueOnce({ role } as never);
    expect((await PUT(request([]))).status).toBe(403);
  }
  expect(db.insert).not.toHaveBeenCalled();
});
it("refuse les écritures anonymes et les identifiants de colonnes invalides", async () => {
  vi.mocked(getUserFromHeaders).mockResolvedValueOnce(null);
  expect((await PUT(request([]))).status).toBe(401);
  for (const body of [null, "articleName", [42], ["unknown"], Array(11).fill("quantity")]) expect((await PUT(request(body))).status).toBe(400);
  expect(db.insert).not.toHaveBeenCalled();
});
it("persiste le paramétrage global avec traçabilité et ordre stable", async () => {
  const response = await PUT(request(["quantity", "articleName", "quantity"]));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ visibleColumns: ["articleName", "quantity"] });
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ key: "article_grouping_visible_columns", value: '["articleName","quantity"]', updatedById: 1, updatedByName: "Admin" }));
  expect(conflict).toHaveBeenCalled();
});
it("autorise le masquage de toutes les colonnes et renvoie la même règle aux autres utilisateurs", async () => {
  expect((await PUT(request([]))).status).toBe(200);
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ value: "[]" }));
  vi.mocked(readGroupingColumns).mockResolvedValue([]);
  vi.mocked(getUserFromHeaders).mockResolvedValue({ role: "commercial" } as never);
  expect(await (await GET(request([]))).json()).toMatchObject({ visibleColumns: [], canConfigure: false });
});
