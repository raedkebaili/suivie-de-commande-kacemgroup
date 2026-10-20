import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import { db } from "@/db";
vi.mock("@/lib/article-grouping-columns-server", () => ({ readGroupingColumns: vi.fn(async () => ["articleName", "power", "familyCategory", "quantity", "affaire", "clientName", "orderNumber", "producedQty", "deliveredQty", "remaining"]) }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn(async () => ({ id: 1, role: "superadmin" })) }));
vi.mock("@/lib/agency-access", () => ({ agencyScopeForUser: vi.fn(() => null) }));
beforeEach(() => {
  const builder = { from: vi.fn(), innerJoin: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(async () => [{ articleName: "Luminaire NOVA CITY V2 48W IP66", quantity: 10 }]) };
  builder.from.mockReturnValue(builder); builder.innerJoin.mockReturnValue(builder); builder.leftJoin.mockReturnValue(builder); builder.where.mockReturnValue(builder);
  vi.mocked(db.select).mockReset()
    .mockReturnValueOnce(builder as never)
    .mockReturnValueOnce({ from: async () => [{ id: 7, category: "ÉCLAIRAGE PUBLIC PERSONNALISÉ", subFamily: "NOVA CITY", variant: "V2" }] } as never)
    .mockReturnValueOnce({ from: async () => [] } as never);
});
it("utilise le catalogue même sans affectation manuelle pour un nouvel article", async () => {
  const response = await GET(new NextRequest("http://test/api/orders/grouped-articles"));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.groups[0].key).toBe("NOVA CITY V2");
  expect(data.groups[0].lines[0]).toMatchObject({ power: 48, familyCategory: "ÉCLAIRAGE PUBLIC PERSONNALISÉ", familySource: "AUTOMATIQUE" });
  expect(data.totals.quantity).toBe(10);
});
it("exporte la même famille et la même puissance dans Excel", async () => {
  const response = await GET(new NextRequest("http://test/api/orders/grouped-articles?format=xlsx"));
  expect(response.status).toBe(200);
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Détail par article"]);
  expect(rows[0]).toMatchObject({ "Famille": "ÉCLAIRAGE PUBLIC PERSONNALISÉ", "Sous-famille / variante": "NOVA CITY V2", "Puissance (W)": 48 });
});
it("l’export suit les colonnes globales décidées par l’admin", async () => {
  const { readGroupingColumns } = await import("@/lib/article-grouping-columns-server");
  vi.mocked(readGroupingColumns).mockResolvedValueOnce(["articleName", "quantity"]);
  const response = await GET(new NextRequest("http://test/api/orders/grouped-articles?format=xlsx"));
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Détail par article"]);
  expect(rows[0]).toHaveProperty("Article"); expect(rows[0]).toHaveProperty("Quantité", 10);
  for (const key of ["Famille", "Puissance (W)", "Produit", "Livré", "Reste à livrer"]) expect(rows[0]).not.toHaveProperty(key);
});
it("n’exporte pas un tableau dont toutes les colonnes sont masquées", async () => {
  const { readGroupingColumns } = await import("@/lib/article-grouping-columns-server");
  vi.mocked(readGroupingColumns).mockResolvedValueOnce([]);
  expect((await GET(new NextRequest("http://test/api/orders/grouped-articles?format=xlsx"))).status).toBe(400);
  expect(db.select).not.toHaveBeenCalled();
});
