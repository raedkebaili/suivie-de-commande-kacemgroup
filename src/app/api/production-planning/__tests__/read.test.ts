import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { GET } from "../route";
import { db } from "@/db";
import { getUserFromHeaders } from "@/lib/auth";
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn() }));
vi.mock("@/lib/production-planning", () => ({ ensurePlanningColors: vi.fn() }));
const builder = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  builder.from.mockReturnValue(builder); builder.leftJoin.mockReturnValue(builder); builder.where.mockReturnValue(builder); builder.orderBy.mockResolvedValue([]);
  vi.mocked(db.select).mockReturnValue(builder as never);
  vi.mocked(getUserFromHeaders).mockResolvedValue({ id: 1, username: "test", fullName: "Test", role: "planification", darkMode: false });
});
it("date=all n'ajoute pas de condition de journée", async () => {
  const response = await GET(new NextRequest("http://test/api/production-planning?date=all"));
  expect(response.status).toBe(200);
  expect((await response.json()).date).toBe("all");
  expect(builder.where.mock.calls[0][0]).toBeUndefined();
});
it("le journalier reste le défaut, l'usine et l'agence restent des intersections même en global", async () => {
  await GET(new NextRequest("http://test/api/production-planning?date=2000-01-01"));
  expect(new PgDialect().sqlToQuery(builder.where.mock.calls[0][0]).params).toEqual(["2000-01-01"]);
  vi.mocked(getUserFromHeaders).mockResolvedValue({ id: 2, username: "agency", fullName: "Agence", role: "acces_agence", agencyIds: [7], darkMode: false });
  await GET(new NextRequest("http://test/api/production-planning?date=all&factoryId=2"));
  const predicate = new PgDialect().sqlToQuery(builder.where.mock.calls[1][0]);
  expect(predicate.params).toEqual([7, 2]);
  expect(predicate.sql).not.toContain("plan_date");
  expect(predicate.sql).toContain("agency_id");
});
it("ne lit aucune donnée sans authentification", async () => {
  vi.mocked(getUserFromHeaders).mockResolvedValue(null);
  expect((await GET(new NextRequest("http://test/api/production-planning?date=all"))).status).toBe(401);
  expect(db.select).not.toHaveBeenCalled();
});
it.each(["date=wrong", "date=all&factoryId=NaN", "date=all&factoryId=-1"])("rejette un périmètre invalide %s", async query => {
  expect((await GET(new NextRequest(`http://test/api/production-planning?${query}`))).status).toBe(400);
  expect(db.select).not.toHaveBeenCalled();
});
