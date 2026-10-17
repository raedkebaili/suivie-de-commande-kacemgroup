import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import { db } from "@/db";
import { getUserFromHeaders } from "@/lib/auth";
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn() }));
const sheet = { id: 1, name: "Dernière feuille", columns: '["Article"]', preamble: '[["Titre"]]', resteColumnIndex: null };
function prepare() {
  vi.mocked(db.select)
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [sheet] }) }) } as never)
    .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => Array.from({ length: 650 }, (_, i) => ({ id: i + 1, rowIndex: i, cells: JSON.stringify([`Article ${i + 1}`]) })) }) }) } as never)
    .mockReturnValueOnce({ from: () => ({ where: async () => [] }) } as never)
    .mockReturnValueOnce({ from: () => ({ where: async () => [] }) } as never);
}
beforeEach(() => {
  vi.mocked(db.select).mockReset();
  vi.mocked(getUserFromHeaders).mockResolvedValue({ id: 1, role: "commercial", username: "test", fullName: "Test", darkMode: false });
  prepare();
});
describe("lecture intégrale d’une feuille d’archive", () => {
  it("renvoie toute la feuille, y compris au-delà de 500 lignes", async () => {
    const response = await GET(new NextRequest("http://test/api/archive/rows?sheetId=1&all=1&page=5&pageSize=100"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.rows).toHaveLength(650);
    expect(data.rows[649].cells).toEqual(["Article 650"]);
    expect(data.pagination).toEqual({ page: 1, pageSize: 650, total: 650, pages: 1 });
  });
  it("conserve la pagination pour les autres clients de l’API", async () => {
    const response = await GET(new NextRequest("http://test/api/archive/rows?sheetId=1&page=2&pageSize=100"));
    const data = await response.json();
    expect(data.rows).toHaveLength(100);
    expect(data.rows[0].cells).toEqual(["Article 101"]);
    expect(data.pagination.pages).toBe(7);
  });
  it("filtre avant de renvoyer la feuille complète", async () => {
    const response = await GET(new NextRequest("http://test/api/archive/rows?sheetId=1&all=1&q=Article%20650"));
    const data = await response.json();
    expect(data.rows).toHaveLength(1);
    expect(data.pagination.total).toBe(1);
  });
  it("refuse les utilisateurs non authentifiés", async () => {
    vi.mocked(getUserFromHeaders).mockResolvedValue(null);
    expect((await GET(new NextRequest("http://test/api/archive/rows?sheetId=1&all=1"))).status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });
});
