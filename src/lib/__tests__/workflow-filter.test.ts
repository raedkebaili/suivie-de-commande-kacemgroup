import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { GET as readProduction } from "@/app/api/production/route";
import { GET as readExpedition } from "@/app/api/expedition/route";
import { NextRequest } from "next/server";
import { orders, orderItems, productionPlanEntries, expeditionPlanEntries } from "@/db/schema";
import { createPlanningDatabase } from "./helpers/planning-db";
import { workflowFilterSQL } from "../workflow-filter-sql";
import { WORKFLOW_FILTERS, appendOrderStateFilter, isWorkflowFilter } from "../workflow-filters";
const state = vi.hoisted(() => ({ db: undefined as unknown as typeof import("@/db").db }));
vi.mock("@/db", () => ({ get db() { return state.db; } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn(async () => ({ id: 1, role: "planification", username: "manager", fullName: "Responsable" })), logActivity: vi.fn() }));
let fixture: Awaited<ReturnType<typeof createPlanningDatabase>>;
beforeAll(async () => {
  fixture = await createPlanningDatabase(); state.db = fixture.database as unknown as typeof db;
  await fixture.client.exec("CREATE TABLE clients (id integer PRIMARY KEY, name text); CREATE TABLE agencies (id integer PRIMARY KEY, name text)");
}, 30_000);
afterAll(async () => { await fixture?.client.close(); });
beforeEach(async () => {
  await fixture.client.exec("TRUNCATE orders, order_items, production_plan_entries, expedition_plan_entries RESTART IDENTITY");
  for (let id = 1; id <= 12; id++) {
    await fixture.database.insert(orders).values({ id, orderNumber: `BC-${id}`, clientId: 1, agencyId: id === 1 ? 7 : 8, status: "BON_COMMANDE", productionStatus: id === 6 ? "ANNULEE" : "EN_INSTANCE" });
    await fixture.database.insert(orderItems).values({ id, orderId: id, articleName: `Article ${id}`, quantity: 100,
      producedQty: [1, 2, 7, 11, 12].includes(id) ? 100 : [4, 10].includes(id) ? 30 : 0,
      deliveredQty: id === 2 ? 20 : id === 7 ? 100 : 0 });
  }
  for (const [id, status] of [[3, "EN_COURS"], [4, "SUSPENDU"], [5, "EN_ATTENTE"], [6, "ANNULE"], [8, "EN_COURS"]] as const) {
    await fixture.database.insert(productionPlanEntries).values({ id, orderId: id, itemId: id, articleName: `Article ${id}`, status, plannedQty: 100, planDate: id === 8 ? "2999-01-01" : "2000-01-01" });
  }
  for (const [id, status] of [[11, "PLANIFIE"], [12, "EN_COURS"]] as const) {
    await fixture.database.insert(expeditionPlanEntries).values({ id, orderId: id, itemId: id, articleName: `Article ${id}`, status, plannedQty: 100, planDate: "2000-01-01", driverName: "Chauffeur" });
  }
});
async function matches(key: string) {
  return (await fixture.database.select({ id: orders.id }).from(orders).where(workflowFilterSQL(key)).orderBy(orders.id)).map(row => row.id);
}
describe("états réels des commandes — prédicat PostgreSQL partagé", () => {
  it("prête à livrer découle des quantités et exclut les livraisons commencées", async () => {
    expect(await matches("READY")).toEqual([1, 11]);
  });
  it("en production croise les plannings atteints et les quantités, sans les suspendus ni les prévisions futures", async () => {
    expect(await matches("production:EN_COURS")).toEqual([3, 10]);
    expect(await matches("production:EN_ATTENTE")).toEqual([5, 8]);
    expect(await matches("production:SUSPENDU")).toEqual([4]);
  });
  it("les livraisons en cours sont identifiées par leur planning ou un cumul partiel", async () => {
    expect(await matches("DELIVERY")).toEqual([2, 12]);
    expect(await matches("expedition:EN_COURS")).toEqual([12]);
    expect(await matches("expedition:NON_TRAITE")).toEqual([11]);
  });
  it("distingue les annulations de commande et celles d'une ligne de planning", async () => {
    expect(await matches("CANCELLED")).toEqual([6]);
    expect(await matches("production:ANNULE")).toEqual([6]);
    expect(await matches("DELIVERED")).toEqual([7]);
  });
  it("livrer tout retire immédiatement l'ordre des filtres actifs", async () => {
    await fixture.database.update(orderItems).set({ deliveredQty: 100 }).where(eq(orderItems.id, 12));
    expect(await matches("DELIVERY")).not.toContain(12);
    expect(await matches("READY")).not.toContain(12);
    expect(await matches("DELIVERED")).toContain(12);
  });
  it("la règle prête impose tous les articles et jamais une compensation entre articles", async () => {
    await fixture.database.insert(orderItems).values({ id: 20, orderId: 1, articleName: "Autre", quantity: 100, producedQty: 0 });
    expect(await matches("READY")).not.toContain(1);
    expect(await matches("production:EN_COURS")).toContain(1);
  });
  it("ne fait pas disparaître les commandes sans planning actif", async () => {
    expect(await matches("UNPLANNED")).toContain(9);
    expect(await matches("UNPLANNED")).not.toContain(5);
    expect(await matches("UNPLANNED")).not.toContain(11);
  });
  it("les filtres ne contournent jamais le périmètre agence", async () => {
    const rows = await fixture.database.select({ id: orders.id }).from(orders).where(and(eq(orders.agencyId, 7), workflowFilterSQL("READY")));
    expect(rows.map(row => row.id)).toEqual([1]);
  });
  it("les anciens états d'expédition sont reconnus sans réécriture des données", async () => {
    await fixture.database.update(expeditionPlanEntries).set({ status: "TERMINE" }).where(eq(expeditionPlanEntries.id, 11));
    expect(await matches("expedition:LIVRE")).toContain(11);
    expect(await matches("expedition:NON_TRAITE")).not.toContain(11);
  });
  it("exécute tous les choix proposés et refuse un filtre inconnu", async () => {
    for (const filter of WORKFLOW_FILTERS) await matches(filter.key);
    expect(isWorkflowFilter("unknown")).toBe(false);
    expect(() => workflowFilterSQL("unknown")).toThrow();
  });
});
it.each([
  ["workflow:READY", "workflow", "READY"], ["workflow:production:SUSPENDU", "workflow", "production:SUSPENDU"],
  ["comm:BON_COMMANDE", "status", "BON_COMMANDE"], ["prod:LIVREE", "productionStatus", "LIVREE"],
  ["planning:EN_COURS", "planningStatus", "EN_COURS"], ["planning:NONE", "workflow", "UNPLANNED"],
])("normalise le filtre %s pour tableau / export / regroupements", (value, key, expected) => {
  const params = new URLSearchParams(); appendOrderStateFilter(params, value);
  expect([...params.entries()]).toEqual([[key, expected]]);
});

it("le filtre d’article ne masque pas la production terminée d’un article dans une commande encore partielle", async () => {
  await fixture.database.insert(orderItems).values({ id: 20, orderId: 1, articleName: "Pas démarré", quantity: 100 });
  expect(await matches("READY")).not.toContain(1);
  const rows = await fixture.database.select({ id: orderItems.id }).from(orderItems).leftJoin(orders, eq(orders.id, orderItems.orderId)).where(workflowFilterSQL("READY", true));
  expect(rows.map(row => row.id)).toContain(1);
  expect(rows.map(row => row.id)).not.toContain(20);
});
it("Production renvoie aussi les anciens produits au-delà de la limite historique de 300", async () => {
  await fixture.database.insert(orderItems).values(Array.from({ length: 310 }, (_, index) => ({ id: index + 1000, orderId: 9, articleName: `Produit ${index}`, quantity: 1 })));
  const response = await readProduction(new NextRequest("http://test/api/production"));
  const payload = await response.json();
  expect(response.status).toBe(200);
  expect(payload.items).toHaveLength(322);
  expect(payload.items.some((row: { itemId: number }) => row.itemId === 1)).toBe(true);
});
it("Production expose les IDs d’articles concernés sans tronquer les articles nécessaires aux totaux", async () => {
  const payload = await (await readProduction(new NextRequest("http://test/api/production?workflow=READY"))).json();
  expect(payload.items).toHaveLength(12);
  expect(payload.matchingItemIds.sort((a: number, b: number) => a - b)).toEqual([1, 11]);
});
it("Expédition retrouve les affectations actives sur toutes les dates, y compris avant aujourd’hui", async () => {
  const response = await readExpedition(new NextRequest("http://test/api/expedition?workflow=DELIVERY"));
  const payload = await response.json();
  expect(response.status).toBe(200);
  expect(payload.matchingItemIds.sort((a: number, b: number) => a - b)).toEqual([2, 12]);
  expect(payload.plans.map((row: { id: number }) => row.id).sort()).toEqual([11, 12]);
});
