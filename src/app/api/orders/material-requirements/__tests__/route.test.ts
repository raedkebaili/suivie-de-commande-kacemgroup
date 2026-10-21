import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import { db } from "@/db";
import type { SQL } from "drizzle-orm";
let queryBuilder: { where: ReturnType<typeof vi.fn>; orderBy: ReturnType<typeof vi.fn> };
vi.mock("@/lib/article-grouping-config", () => ({ readGroupingConfig: vi.fn(async () => ({ categories: [{ key: "driver", name: "Driver", active: true }], selectedKeys: ["driver"], current: [{ id: 1, key: "driver" }] })) }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn(async () => ({ id: 1, role: "superadmin" })) }));
vi.mock("@/lib/agency-access", () => ({ agencyScopeForUser: vi.fn(() => null) }));
beforeEach(() => {
  const builder = { from: vi.fn(), innerJoin: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(async () => [{ articleName: "Luminaire NOVA CITY V2 48W IP66", quantity: 10 }]) };
  queryBuilder = builder;
  builder.from.mockReturnValue(builder); builder.innerJoin.mockReturnValue(builder); builder.leftJoin.mockReturnValue(builder); builder.where.mockReturnValue(builder);
  vi.mocked(db.select).mockReset()
    .mockReturnValueOnce(builder as never)
    .mockReturnValueOnce({ from: async () => [{ id: 7, category: "ÉCLAIRAGE PUBLIC PERSONNALISÉ", subFamily: "NOVA CITY", variant: "V2" }] } as never)
    .mockReturnValueOnce({ from: async () => [] } as never)
    .mockReturnValueOnce({ from: () => ({ where: async () => [] }) } as never);
});
it("utilise le catalogue même sans affectation manuelle pour un nouvel article", async () => {
  const response = await GET(new NextRequest("http://test/api/orders/material-requirements"));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.options.families).toEqual(["ÉCLAIRAGE PUBLIC PERSONNALISÉ"]);
  expect(data.options.powers).toEqual(["48"]);
  expect(data.totals.quantity).toBe(10);
  expect(data.selectedKeys).toContain("driver");
});
it("exporte les feuilles de synthèse même si aucune matière n’est renseignée", async () => {
  const response = await GET(new NextRequest("http://test/api/orders/material-requirements?format=xlsx"));
  expect(response.status).toBe(200);
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
  expect(workbook.SheetNames).toEqual(["Besoin par matière", "Totaux catégories", "Règles de calcul"]);
  expect(XLSX.utils.sheet_to_json(workbook.Sheets["Besoin par matière"])).toEqual([]);
});

it("refuse une agence ou des filtres mal formés avant toute lecture", async () => {
  for (const query of ["agencyId=abc", "sorts=%7B%7D", "dateFrom=2026-02-30"]) {
    expect((await GET(new NextRequest(`http://test/api/orders/material-requirements?${query}`))).status).toBe(400);
  }
  expect(db.select).not.toHaveBeenCalled();
});
it("refuse une requête non authentifiée", async () => {
  const { getUserFromHeaders } = await import("@/lib/auth");
  vi.mocked(getUserFromHeaders).mockResolvedValueOnce(null);
  expect((await GET(new NextRequest("http://test/api/orders/material-requirements"))).status).toBe(401);
  expect(db.select).not.toHaveBeenCalled();
});
it("charge uniquement les composants des articles dans le périmètre autorisé", async () => {
  const { agencyScopeForUser } = await import("@/lib/agency-access");
  vi.mocked(agencyScopeForUser).mockReturnValueOnce([7]);
  const builder = queryBuilder;
  builder.orderBy.mockResolvedValue([{ itemId: 12, articleName: "NETLUX 100W", quantity: 10 }]);
  const componentWhere = vi.fn(async (_condition: SQL) => []);
  vi.mocked(db.select).mockReset().mockReturnValueOnce(builder as never)
    .mockReturnValueOnce({ from: async () => [] } as never).mockReturnValueOnce({ from: async () => [] } as never)
    .mockReturnValueOnce({ from: () => ({ where: componentWhere }) } as never);
  expect((await GET(new NextRequest("http://test/api/orders/material-requirements"))).status).toBe(200);
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const predicate = dialect.sqlToQuery(builder.where.mock.calls.at(-1)![0]);
  expect(predicate.params.slice(0, 4)).toEqual(["PREVISION", "BON_COMMANDE", "SUR_STOCK", "EN_INSTANCE"]);
  expect(predicate.params.at(-1)).toBe(7);
  expect(predicate.sql).toContain("material_scope_item");
  expect(predicate.sql).toContain("production_plan_entries");
  expect(dialect.sqlToQuery(componentWhere.mock.calls[0][0]).params).toEqual([12]);
});
it("exporte les mêmes références et totaux filtrés que le JSON", async () => {
  const rows = [
    { itemId: 1, articleName: "NETLUX 100W", quantity: 10, clientName: "A" },
    { itemId: 2, articleName: "NETLUX 100W", quantity: 20, clientName: "B" },
    { itemId: 3, articleName: "NETLUX 100W", quantity: 99, clientName: "C" },
  ];
  const components = [{ itemId: 1, categoryId: 1, categoryKey: "driver", categoryName: "Driver", materialId: 9, materialReference: "DX", materialLabel: "Driver X" }, { itemId: 2, categoryId: 1, categoryKey: "driver", categoryName: "Driver", materialId: 10, materialReference: "DY", materialLabel: "Driver Y" }];
  const setup = () => {
    const builder = { from: vi.fn(), innerJoin: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(async () => rows) };
    for (const method of ["from", "innerJoin", "leftJoin", "where"] as const) builder[method].mockReturnValue(builder);
    vi.mocked(db.select).mockReset().mockReturnValueOnce(builder as never)
      .mockReturnValueOnce({ from: async () => [] } as never).mockReturnValueOnce({ from: async () => [] } as never)
      .mockReturnValueOnce({ from: () => ({ where: async () => components }) } as never);
  };
  const query = `clients=A&clients=B&sorts=${encodeURIComponent(JSON.stringify([{ field: "quantity", direction: "desc" }]))}`;
  setup();
  const json = await (await GET(new NextRequest(`http://test/api/orders/material-requirements?${query}`))).json();
  expect(json).not.toHaveProperty("lines"); // Pas de duplication des articles dans une réponse de synthèse.
  expect(json.totals.quantity).toBe(30);
  expect(json.summary[0]).toMatchObject({ quantity: 30, missingLines: 0 });
  expect(json.summary[0].materials.map((m: { quantity: number }) => m.quantity)).toEqual([10, 20]);
  setup();
  const xlsx = await GET(new NextRequest(`http://test/api/orders/material-requirements?${query}&format=xlsx`));
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(await xlsx.arrayBuffer()), { type: "buffer" });
  const detail = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Besoin par matière"]);
  expect(detail.map(l => l["Besoin (unités)"])).toEqual([10, 20]);
  expect(detail[0]).toMatchObject({ "Référence": "DX", "Matière": "Driver X" });
  const totals = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Totaux catégories"]);
  expect(totals[0]).toMatchObject({ "Besoin connu (unités)": 30, "Lignes non renseignées": 0 });
});
it("refuse un filtre sur une catégorie non visible", async () => {
  const query = encodeURIComponent(JSON.stringify([{ key: "secret", mode: "missing", text: "" }]));
  expect((await GET(new NextRequest(`http://test/api/orders/material-requirements?technical=${query}`))).status).toBe(400);
});

it("inclut toutes les matières saisies même si l'ancienne configuration de colonnes est vide", async () => {
  const { readGroupingConfig } = await import("@/lib/article-grouping-config");
  vi.mocked(readGroupingConfig).mockResolvedValueOnce({ categories: [{ key: "driver", name: "Driver" }, { key: "lens", name: "Lentille" }], selectedKeys: [], current: [{ id: 1, key: "driver" }, { id: 2, key: "lens" }] } as never);
  const builder = queryBuilder;
  builder.orderBy.mockResolvedValue([{ itemId: 12, articleName: "NETLUX 100W", quantity: 10 }]);
  const components = [
    { itemId: 12, categoryId: 1, categoryKey: "driver", categoryName: "Driver", materialId: 8, materialReference: "DX", materialLabel: "Driver X" },
    { itemId: 12, categoryId: 2, categoryKey: "lens", categoryName: "Lentille", materialId: 9, materialReference: "LX", materialLabel: "Lentille X" },
  ];
  vi.mocked(db.select).mockReset().mockReturnValueOnce(builder as never)
    .mockReturnValueOnce({ from: async () => [] } as never).mockReturnValueOnce({ from: async () => [] } as never)
    .mockReturnValueOnce({ from: () => ({ where: async () => components }) } as never);
  const result = await (await GET(new NextRequest("http://test/api/orders/material-requirements"))).json();
  expect(result.summary.map((c: { key: string; quantity: number }) => [c.key, c.quantity])).toEqual([["driver", 10], ["lens", 10]]);
});
it("filtre et exporte les références agrégées sans changer le périmètre des articles sources", async () => {
  const builder = queryBuilder;
  builder.orderBy.mockResolvedValue([{ itemId: 12, articleName: "NETLUX 100W", quantity: 10 }]);
  const components = [
    { itemId: 12, categoryId: 1, categoryKey: "driver", categoryName: "Driver", materialId: 8, materialReference: "DX", materialLabel: "Driver X" },
    { itemId: 12, categoryId: 1, categoryKey: "driver", categoryName: "Driver", materialId: 9, materialReference: "DY", materialLabel: "Driver Y" },
  ];
  const setup = () => vi.mocked(db.select).mockReset().mockReturnValueOnce(builder as never)
    .mockReturnValueOnce({ from: async () => [] } as never).mockReturnValueOnce({ from: async () => [] } as never)
    .mockReturnValueOnce({ from: () => ({ where: async () => components }) } as never);
  setup();
  const url = "http://test/api/orders/material-requirements?materialQ=DX&minNeed=10";
  const result = await (await GET(new NextRequest(url))).json();
  expect(result.summary[0].materials).toHaveLength(1);
  expect(result.summary[0]).toMatchObject({ quantity: 10 });
  expect(result.totals.quantity).toBe(10);
  setup();
  const excel = await GET(new NextRequest(url + "&format=xlsx"));
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(await excel.arrayBuffer()), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Besoin par matière"]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ "Référence": "DX", "Besoin (unités)": 10 });
});
