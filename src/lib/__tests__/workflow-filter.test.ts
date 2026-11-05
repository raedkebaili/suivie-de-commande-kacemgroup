import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { GET as readOrders } from "@/app/api/orders/route";
import { GET as readGrouped } from "@/app/api/orders/grouped-articles/route";
import { GET as readExport } from "@/app/api/orders/export/route";
import { GET as readProduction } from "@/app/api/production/route";
import { GET as readExpedition } from "@/app/api/expedition/route";
import { NextRequest } from "next/server";
import { orders, orderItems, productionPlanEntries, expeditionPlanEntries, clients, agencies, itemTechnicalComponents, driveDocuments, photometricStudies, photometricStudyItems, articleFamilyCatalog, articleFamilyAssignments, materialCategories, matieres } from "@/db/schema";
import { createPlanningDatabase } from "./helpers/planning-db";
import { workflowFilterSQL } from "../workflow-filter-sql";
import { WORKFLOW_FILTERS, appendOrderStateFilter, isWorkflowFilter, normalizeOrderStateFilter } from "../workflow-filters";
const state = vi.hoisted(() => ({ db: undefined as unknown as typeof import("@/db").db }));
vi.mock("@/db", () => ({ get db() { return state.db; } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn(async () => ({ id: 1, role: "planification", username: "manager", fullName: "Responsable" })), logActivity: vi.fn() }));
let fixture: Awaited<ReturnType<typeof createPlanningDatabase>>;
beforeAll(async () => {
  fixture = await createPlanningDatabase([clients, agencies, itemTechnicalComponents, driveDocuments, photometricStudies, photometricStudyItems, articleFamilyCatalog, articleFamilyAssignments, materialCategories, matieres]); state.db = fixture.database as unknown as typeof db;
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
async function itemMatches(key: string) {
  return (await fixture.database.select({ id: orderItems.id }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id)).where(workflowFilterSQL(key, true)).orderBy(orderItems.id)).map(row => row.id);
}
describe("filtres V2 — portée explicite et correspondance exacte", () => {
  it("n’infère jamais un planning EN_COURS à partir du seul cumul produit", async () => {
    expect(await matches("prod-item:ACTIVE")).toEqual([3]);
    expect(await itemMatches("prod-item:ACTIVE")).toEqual([3]);
    expect(await itemMatches("prod-item:PLANNED")).toEqual([3, 4, 5, 8]);
  });
  it("la commande entière prête exige chaque article entièrement produit et aucune livraison commencée", async () => {
    expect(await matches("prod-order:READY")).toEqual([1, 11, 12]);
    expect(await itemMatches("prod-item:READY")).toEqual([1, 2, 11, 12]);
    await fixture.database.insert(orderItems).values({ id: 20, orderId: 1, articleName: "Non produit", quantity: 100 });
    expect(await matches("prod-order:READY")).not.toContain(1);
    expect(await itemMatches("prod-item:READY")).toContain(1);
    expect(await itemMatches("prod-item:READY")).not.toContain(20);
    expect(await matches("prod-item:ACTIVE")).not.toContain(1);
  });
  it("aucun cumul d’un autre article ne compense un manque", async () => {
    await fixture.database.update(orderItems).set({ producedQty: 200 }).where(eq(orderItems.id, 1));
    await fixture.database.insert(orderItems).values({ id: 20, orderId: 1, articleName: "Non produit", quantity: 100 });
    expect(await matches("prod-order:READY")).not.toContain(1);
    await fixture.database.update(orderItems).set({ deliveredQty: 200 }).where(eq(orderItems.id, 1));
    expect(await matches("ship-order:DELIVERED")).not.toContain(1);
    expect(await matches("ship-order:PARTIAL")).toContain(1);
  });
  it("distingue livraison totale, partielle et article complètement livré", async () => {
    expect(await matches("ship-order:DELIVERED")).toEqual([7]);
    expect(await matches("ship-order:PARTIAL")).toEqual([2]);
    expect(await itemMatches("ship-item:DELIVERED")).toEqual([7]);
    await fixture.database.update(orderItems).set({ deliveredQty: 100 }).where(eq(orderItems.id, 12));
    expect(await matches("ship-order:DELIVERED")).toEqual([7, 12]);
    expect(await itemMatches("ship-item:READY")).not.toContain(12);
    expect(await matches("ship-order:PARTIAL")).not.toContain(12);
  });
  it("une affectation d’expédition seule n’est pas une livraison partielle", async () => {
    expect(await matches("ship-order:PARTIAL")).not.toContain(12);
    expect(await matches("ship-order:DELIVERED")).not.toContain(12);
  });
  it("sépare absence de planning production et absence de planning expédition", async () => {
    expect(await matches("prod-order:UNPLANNED")).toEqual([9, 10]);
    expect(await matches("ship-order:UNPLANNED")).toEqual([1, 3, 4, 5, 8, 9, 10]);
    expect(await itemMatches("ship-item:UNPLANNED")).toEqual([9, 10]);
    expect(await itemMatches("ship-item:PLANNED")).toEqual([3, 4, 5, 8]);
  });
  it("un article non planifié ne rend pas toute sa commande non planifiée", async () => {
    await fixture.database.insert(orderItems).values({ id: 20, orderId: 3, articleName: "Non planifié", quantity: 1 });
    expect(await matches("prod-order:UNPLANNED")).not.toContain(3);
    expect(await itemMatches("ship-item:UNPLANNED")).toContain(20);
    expect(await itemMatches("prod-item:ACTIVE")).not.toContain(20);
  });
  it("une annulation de planning n’annule pas les autres articles de la commande", async () => {
    await fixture.database.insert(productionPlanEntries).values({ id: 30, itemId: 9, orderId: 9, articleName: "Annulé", plannedQty: 100, planDate: "2000-01-01", status: "ANNULE" });
    await fixture.database.insert(orderItems).values({ id: 20, orderId: 9, articleName: "Non annulé", quantity: 1 });
    expect(await matches("prod-order:CANCELLED")).toEqual([6]);
    expect(await itemMatches("prod-item:CANCELLED")).toEqual([6, 9]);
    expect(await itemMatches("prod-item:CANCELLED")).not.toContain(20);
    expect(await itemMatches("ship-item:CANCELLED")).toContain(9);
    expect(await itemMatches("ship-item:UNPLANNED")).not.toContain(9);
  });
  it("tous les articles annulés constituent une commande entièrement annulée", async () => {
    await fixture.database.insert(expeditionPlanEntries).values({ driverName: "Chauffeur", id: 30, itemId: 9, orderId: 9, articleName: "Annulé", plannedQty: 100, planDate: "2000-01-01", status: "ANNULE" });
    expect(await matches("ship-order:CANCELLED")).toEqual([6, 9]);
    expect(await itemMatches("ship-item:READY")).not.toContain(9);
  });
  it("une ancienne annulation ne contamine pas une replanification", async () => {
    await fixture.database.insert(productionPlanEntries).values([
      { id: 30, itemId: 9, orderId: 9, articleName: "Article", plannedQty: 100, planDate: "2000-01-01", status: "ANNULE" },
      { id: 31, itemId: 9, orderId: 9, articleName: "Article", plannedQty: 100, planDate: "2000-01-01", status: "EN_COURS" },
    ]);
    expect(await itemMatches("prod-item:CANCELLED")).not.toContain(9);
    expect(await itemMatches("prod-item:ACTIVE")).toContain(9);
  });
  it("le planning d’un autre article ou une référence de commande incohérente ne correspondent jamais", async () => {
    await fixture.database.insert(productionPlanEntries).values({ id: 30, itemId: 9, orderId: 10, articleName: "Incohérent", plannedQty: 100, planDate: "2000-01-01", status: "EN_COURS" });
    expect(await itemMatches("prod-item:ACTIVE")).toEqual([3]);
    expect(await matches("prod-item:ACTIVE")).toEqual([3]);
  });
  it("n’inclut pas les commandes vides ou à quantité nulle par vérité universelle", async () => {
    await fixture.database.delete(orderItems).where(eq(orderItems.id, 1));
    await fixture.database.update(orderItems).set({ quantity: 0 }).where(eq(orderItems.id, 9));
    for (const filter of WORKFLOW_FILTERS) {
      if (!filter.key.endsWith(":CANCELLED")) {
        expect(await matches(filter.key)).not.toContain(1);
        expect(await matches(filter.key)).not.toContain(9);
      }
    }
  });
  it("les conditions conservent le périmètre agence", async () => {
    const rows = await fixture.database.select({ id: orders.id }).from(orders).where(and(eq(orders.agencyId, 7), workflowFilterSQL("prod-order:READY")));
    expect(rows.map(row => row.id)).toEqual([1]);
  });
  it("refuse les anciens filtres ambigus et les valeurs inconnues", async () => {
    for (const filter of WORKFLOW_FILTERS) await matches(filter.key);
    for (const key of ["production:EN_COURS", "READY", "unknown"]) {
      expect(isWorkflowFilter(key)).toBe(false);
      expect(() => workflowFilterSQL(key)).toThrow();
    }
    expect((await readProduction(new NextRequest("http://test/api/production?workflow=production:EN_COURS"))).status).toBe(400);
  });
});
it.each([
  ["workflow:prod-item:ACTIVE", "workflow", "prod-item:ACTIVE"],
  ["comm:BON_COMMANDE", "status", "BON_COMMANDE"],
  ["comm:PREVISION", "status", "PREVISION"],
  ["comm:SUR_STOCK", "status", "SUR_STOCK"],
])("sérialise %s sans confusion de portée", (value, key, expected) => {
  const params = new URLSearchParams(); appendOrderStateFilter(params, value);
  expect([...params.entries()]).toEqual([[key, expected]]);
});
it("Production renvoie tous les articles au-delà de l’ancienne limite de 300", async () => {
  await fixture.database.insert(orderItems).values(Array.from({ length: 310 }, (_, index) => ({ id: index + 1000, orderId: 9, articleName: `Produit ${index}`, quantity: 1 })));
  const response = await readProduction(new NextRequest("http://test/api/production"));
  expect((await response.json()).items).toHaveLength(322);
});
it("l’API opérationnelle filtre les IDs exacts, mais conserve les sources des totaux", async () => {
  await fixture.database.insert(orderItems).values({ id: 20, orderId: 3, articleName: "Pas en cours", quantity: 1 });
  const payload = await (await readProduction(new NextRequest("http://test/api/production?workflow=prod-item:ACTIVE"))).json();
  expect(payload.items).toHaveLength(13);
  expect(payload.matchingItemIds).toEqual([3]);
});
it("un filtre commande entière sélectionne tous ses articles ou aucun, même dans une vue opérationnelle", async () => {
  await fixture.database.insert(orderItems).values({ id: 20, orderId: 1, articleName: "Non produit", quantity: 1 });
  expect(await itemMatches("prod-order:READY")).not.toContain(1);
  expect(await itemMatches("prod-order:READY")).not.toContain(20);
});
it("Expédition ne confond pas une affectation active et des articles réellement livrés", async () => {
  const payload = await (await readExpedition(new NextRequest("http://test/api/expedition?workflow=ship-item:DELIVERED"))).json();
  expect(payload.matchingItemIds).toEqual([7]);
  expect(payload.plans.map((row: { id: number }) => row.id).sort()).toEqual([11, 12]);
});
it("les filtres commerciaux fonctionnent dans les deux vues opérationnelles", async () => {
  await fixture.database.update(orders).set({ status: "PREVISION" }).where(eq(orders.id, 3));
  for (const read of [readProduction, readExpedition]) {
    const payload = await (await read(new NextRequest("http://test/api/view?status=PREVISION"))).json();
    expect(payload.matchingItemIds).toEqual([3]);
  }
});

it("Commandes ne retourne que les commandes correspondantes et identifie les articles à afficher, sans modifier les totaux", async () => {
  await fixture.database.insert(orderItems).values({ id: 20, orderId: 3, articleName: "Autre article", quantity: 25 });
  const response = await readOrders(new NextRequest("http://test/api/orders?workflow=prod-item:ACTIVE"));
  expect(response.status).toBe(200);
  const { orders: rows } = await response.json();
  expect(rows.map((row: { id: number }) => row.id)).toEqual([3]);
  expect(rows[0].matchingItemIds).toEqual([3]);
  expect(rows[0].items).toHaveLength(2);
  expect(rows[0].totalQty).toBe(125);
});
it("le regroupement ne réintroduit pas les autres articles de la commande filtrée", async () => {
  await fixture.database.insert(orderItems).values({ id: 20, orderId: 3, articleName: "Intrus", quantity: 25 });
  const response = await readGrouped(new NextRequest("http://test/api/orders/grouped-articles?workflow=prod-item:ACTIVE"));
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(JSON.stringify(payload)).toContain("Article 3");
  expect(JSON.stringify(payload)).not.toContain("Intrus");
});
it("l’export Excel respecte le même filtre article que le tableau et le regroupement", async () => {
  await fixture.database.insert(orderItems).values({ id: 20, orderId: 3, articleName: "Intrus", quantity: 25 });
  const response = await readExport(new NextRequest("http://test/api/orders/export?workflow=prod-item:ACTIVE"));
  expect(response.status).toBe(200);
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });
  const rows = workbook.SheetNames.flatMap(name => XLSX.utils.sheet_to_json(workbook.Sheets[name]));
  expect(JSON.stringify(rows)).toContain("Article 3");
  expect(JSON.stringify(rows)).not.toContain("Intrus");
});
it("un ancien drapeau manuel livré ne remplace pas les quantités article", async () => {
  await fixture.database.update(orders).set({ productionStatus: "LIVREE" }).where(eq(orders.id, 9));
  expect(await matches("ship-order:DELIVERED")).not.toContain(9);
  expect(await itemMatches("ship-item:DELIVERED")).not.toContain(9);
});

it("les anciennes préférences enregistrées ne réactivent pas les filtres obsolètes", () => {
  for (const old of ["workflow:production:EN_COURS", "workflow:DELIVERY", "prod:LIVREE", "planning:NONE", null, "workflow:"]) expect(normalizeOrderStateFilter(old)).toBe("");
  expect(normalizeOrderStateFilter("workflow:prod-item:ACTIVE")).toBe("workflow:prod-item:ACTIVE");
  expect(normalizeOrderStateFilter("comm:PREVISION")).toBe("comm:PREVISION");
});
