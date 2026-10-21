import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, productionBatches, expeditionBatches, productionPlanEntries, expeditionPlanEntries, activityLogs } from "@/db/schema";
import { undoPlanning } from "../planning-undo";
import { applyProductionQuantity } from "../production-apply";
import { materialDemandScope } from "../material-demand-scope";
import { createPlanningDatabase, planningTables } from "./helpers/planning-db";
import { getTableConfig } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { PUT as deliverPlan } from "@/app/api/expedition-planning/[id]/route";
import { POST as deliverManual } from "@/app/api/expedition/route";
const state = vi.hoisted(() => ({ db: undefined as unknown as typeof import("@/db").db }));
vi.mock("@/db", () => ({ get db() { return state.db; } }));
vi.mock("@/lib/auth", () => ({ getUserFromHeaders: vi.fn(async () => ({ id: 1, username: "manager", fullName: "Responsable", role: "planification" })), logActivity: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ NOTIFICATION_EVENTS: {}, notifyRoles: vi.fn() }));
vi.mock("@/lib/priority-promotion", () => ({ isOrderFullyProduced: vi.fn(async () => false), promotePrioritiesAfterCompletion: vi.fn() }));
let fixture: Awaited<ReturnType<typeof createPlanningDatabase>>;
const actor = { id: 1, username: "manager", fullName: "Responsable" };
beforeAll(async () => { fixture = await createPlanningDatabase(); state.db = fixture.database as unknown as typeof db; }, 30_000);
afterAll(async () => { await fixture?.client.close(); });
beforeEach(async () => {
  await fixture.client.exec(`TRUNCATE ${planningTables.map(table => `"${getTableConfig(table).name}"`).join(",")} RESTART IDENTITY`);
  await db.insert(orders).values({ id: 1, orderNumber: "BC-1", clientId: 1, agencyId: 1, status: "BON_COMMANDE" });
  await db.insert(orderItems).values({ id: 1, orderId: 1, articleName: "Article A", quantity: 100 });
  await db.insert(productionPlanEntries).values({ id: 1, itemId: 1, orderId: 1, articleName: "Article A", plannedQty: 100, planDate: "2026-10-21" });
  await db.insert(expeditionPlanEntries).values({ id: 1, itemId: 1, orderId: 1, articleName: "Article A", plannedQty: 100, planDate: "2026-10-21", driverName: "Chauffeur", status: "ANNULE" });
});
const prod = async () => (await db.select().from(productionPlanEntries))[0];
const exp = async () => (await db.select().from(expeditionPlanEntries))[0];
const item = async () => (await db.select().from(orderItems).where(eq(orderItems.id, 1)))[0];
async function produce(qty = 100) {
  const entry = await prod();
  return applyProductionQuantity({ itemId: 1, qty, user: actor, planning: { id: 1, expectedUpdatedAt: entry.updatedAt, updates: {} } });
}
async function deliver() {
  await db.update(expeditionPlanEntries).set({ status: "NON_TRAITE" }).where(eq(expeditionPlanEntries.id, 1));
  return deliverPlan(new NextRequest("http://test/api/expedition-planning/1", { method: "PUT", body: JSON.stringify({ status: "LIVRE" }) }), { params: Promise.resolve({ id: "1" }) });
}
describe("retour arrière transactionnel des plannings", () => {
  it("compense la production, conserve le lot original et rétablit le besoin matière", async () => {
    expect((await produce()).ok).toBe(true);
    expect((await db.select().from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(materialDemandScope()))).toHaveLength(0);
    const result = await undoPlanning("production", 1, (await prod()).updatedAt, actor);
    expect(result).toMatchObject({ reversedQty: 100, cumulative: 0, status: "EN_ATTENTE" });
    expect(await prod()).toMatchObject({ appliedQty: 0, appliedAt: null, reason: null, plannedQty: 100 });
    expect((await item()).producedQty).toBe(0);
    expect((await db.select().from(productionBatches)).map(row => row.quantity)).toEqual([100, -100]);
    expect((await db.select().from(activityLogs)).filter(row => row.action === "PLANNING_PRODUCTION_UNDO")).toHaveLength(1);
    expect((await db.select().from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(materialDemandScope()))).toHaveLength(1);
  });
  it("soustrait la quantité effectivement appliquée, pas la quantité planifiée", async () => {
    await db.update(orderItems).set({ producedQty: 70 });
    expect(await produce()).toMatchObject({ ok: true, actualQty: 30 });
    await undoPlanning("production", 1, (await prod()).updatedAt, actor);
    expect((await item()).producedQty).toBe(70);
    expect((await db.select().from(productionBatches)).map(row => row.quantity)).toEqual([30, -30]);
  });
  it("protège les autres lots et les autres articles", async () => {
    await produce(40);
    await db.update(orderItems).set({ producedQty: 70 });
    await db.insert(orderItems).values({ id: 2, orderId: 1, articleName: "Article B", producedQty: 20, quantity: 100 });
    await undoPlanning("production", 1, (await prod()).updatedAt, actor);
    expect((await item()).producedQty).toBe(30);
    expect((await db.select().from(orderItems).where(eq(orderItems.id, 2)))[0].producedQty).toBe(20);
  });
  it("est compatible avec les anciennes lignes qui n'ont pas de lien vers leur lot", async () => {
    await db.update(orderItems).set({ producedQty: 100 });
    await db.update(productionPlanEntries).set({ status: "TERMINE", appliedQty: 100, appliedAt: "2026-10-20" });
    await db.insert(productionBatches).values({ itemId: 1, orderId: 1, quantity: 100, cumulativeTotal: 100, producedBy: "Ancien", productionDate: "2026-10-20" });
    await undoPlanning("production", 1, (await prod()).updatedAt, actor);
    expect((await item()).producedQty).toBe(0);
  });
  it("refuse une production dont les unités sont déjà livrées et n'écrit rien", async () => {
    await produce();
    expect((await deliver()).status).toBe(200);
    const snapshot = await prod();
    await expect(undoPlanning("production", 1, snapshot.updatedAt, actor)).rejects.toThrow("Annulez d'abord les expéditions");
    expect(await prod()).toEqual(snapshot);
    expect((await item()).producedQty).toBe(100);
    expect((await db.select().from(productionBatches))).toHaveLength(1);
  });
  it("refuse aussi une production réservée par un planning d'expédition actif", async () => {
    await produce();
    await db.update(expeditionPlanEntries).set({ status: "NON_TRAITE" });
    await expect(undoPlanning("production", 1, (await prod()).updatedAt, actor)).rejects.toThrow("réservent cette production");
  });
  it("annule d'abord la livraison sans toucher au produit puis permet la correction de production après retrait du planning réservé", async () => {
    await produce(); await deliver();
    expect((await db.select().from(orders))[0].productionStatus).toBe("LIVREE");
    expect(await undoPlanning("expedition", 1, (await exp()).updatedAt, actor)).toMatchObject({ reversedQty: 100, cumulative: 0 });
    expect(await item()).toMatchObject({ producedQty: 100, deliveredQty: 0, deliveryDate: null });
    expect(await exp()).toMatchObject({ loadedQty: 0, status: "NON_TRAITE", plannedQty: 100, driverName: "Chauffeur" });
    expect((await db.select().from(orders))[0].productionStatus).toBe("EN_PRODUCTION");
    expect((await db.select().from(expeditionBatches)).map(row => row.quantity)).toEqual([100, -100]);
    await db.update(expeditionPlanEntries).set({ status: "ANNULE" });
    await undoPlanning("production", 1, (await prod()).updatedAt, actor);
    expect(await item()).toMatchObject({ producedQty: 0, deliveredQty: 0 });
    expect((await db.select().from(orders))[0].productionStatus).toBe("EN_INSTANCE");
  });
  it("annule un cumul d'expédition partiel tout en conservant les autres livraisons", async () => {
    await db.update(orderItems).set({ producedQty: 100, deliveredQty: 60, deliveryDate: "2026-10-20" });
    await db.update(expeditionPlanEntries).set({ loadedQty: 20, status: "EN_COURS" });
    expect(await undoPlanning("expedition", 1, (await exp()).updatedAt, actor)).toMatchObject({ reversedQty: 20, cumulative: 40 });
    expect(await item()).toMatchObject({ producedQty: 100, deliveredQty: 40 });
  });
  it("produire → annuler → reproduire n'ajoute jamais deux fois la quantité", async () => {
    await produce();
    await undoPlanning("production", 1, (await prod()).updatedAt, actor);
    expect((await produce()).ok).toBe(true);
    expect((await produce()).ok).toBe(false);
    expect((await item()).producedQty).toBe(100);
    expect((await db.select().from(productionBatches)).map(row => row.quantity)).toEqual([100, -100, 100]);
  });
  it("livrer → annuler → relivrer conserve le bon cumul", async () => {
    await produce(); await deliver();
    await undoPlanning("expedition", 1, (await exp()).updatedAt, actor);
    expect((await deliver()).status).toBe(200);
    expect((await item()).deliveredQty).toBe(100);
    expect((await db.select().from(expeditionBatches)).map(row => row.quantity)).toEqual([100, -100, 100]);
  });
  it("corrige aussi une livraison saisie par le module Expédition avec planningId", async () => {
    await produce();
    await db.update(expeditionPlanEntries).set({ status: "NON_TRAITE" });
    const response = await deliverManual(new NextRequest("http://test/api/expedition", { method: "POST", body: JSON.stringify({ itemId: 1, batchQty: 40, planningId: 1 }) }));
    expect(response.status).toBe(200);
    expect((await exp()).loadedQty).toBe(40);
    await undoPlanning("expedition", 1, (await exp()).updatedAt, actor);
    expect((await item()).deliveredQty).toBe(0);
  });
  it("une requête répétée / un double clic ne soustrait qu'une seule fois", async () => {
    await produce(); const version = (await prod()).updatedAt;
    const results = await Promise.allSettled([undoPlanning("production", 1, version, actor), undoPlanning("production", 1, version, actor)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await item()).producedQty).toBe(0);
    expect((await db.select().from(productionBatches))).toHaveLength(2);
  });
  it("une version périmée ne peut pas annuler une nouvelle validation", async () => {
    await produce(); const version = (await prod()).updatedAt;
    await undoPlanning("production", 1, version, actor); await produce();
    await expect(undoPlanning("production", 1, version, actor)).rejects.toThrow("La ligne a changé");
    expect((await item()).producedQty).toBe(100);
  });
  it("retourne les états non traités sans soustraire de quantité inexistante", async () => {
    await db.update(productionPlanEntries).set({ status: "EN_COURS", reason: "Erreur" });
    await undoPlanning("production", 1, (await prod()).updatedAt, actor);
    expect(await prod()).toMatchObject({ status: "EN_ATTENTE", reason: null });
    expect(await db.select().from(productionBatches)).toHaveLength(0);
  });
  it("ne devine jamais un cumul manquant sur une ancienne ligne terminée", async () => {
    await db.update(productionPlanEntries).set({ status: "TERMINE", appliedQty: 0 });
    await expect(undoPlanning("production", 1, (await prod()).updatedAt, actor)).rejects.toThrow("introuvable");
  });
  it("refuse de produire un cumul négatif", async () => {
    await produce(); await db.update(orderItems).set({ producedQty: 10 });
    await expect(undoPlanning("production", 1, (await prod()).updatedAt, actor)).rejects.toThrow("inférieur");
    expect((await item()).producedQty).toBe(10);
  });
  it("ne réactive pas une commande annulée et ne change pas son état commercial", async () => {
    await produce(); await db.update(orders).set({ productionStatus: "ANNULEE" });
    await undoPlanning("production", 1, (await prod()).updatedAt, actor);
    expect((await db.select().from(orders))[0]).toMatchObject({ status: "BON_COMMANDE", productionStatus: "ANNULEE" });
  });
  it("une panne d'audit annule aussi le lot inverse, le cumul et la remise à zéro", async () => {
    await produce(); const before = await prod();
    await fixture.client.exec("ALTER TABLE activity_logs ADD CONSTRAINT reject_undo CHECK (action <> 'PLANNING_PRODUCTION_UNDO')");
    try {
      await expect(undoPlanning("production", 1, before.updatedAt, actor)).rejects.toThrow();
      expect(await prod()).toEqual(before);
      expect((await item()).producedQty).toBe(100);
      expect((await db.select().from(productionBatches))).toHaveLength(1);
    } finally { await fixture.client.exec("ALTER TABLE activity_logs DROP CONSTRAINT reject_undo"); }
  });
});

it("ne soustrait que sa ligne parmi deux productions réellement appliquées au même article", async () => {
  await produce(40);
  const [second] = await db.insert(productionPlanEntries).values({ id: 2, itemId: 1, orderId: 1, articleName: "Article A", plannedQty: 60, planDate: "2026-10-21" }).returning();
  expect((await applyProductionQuantity({ itemId: 1, qty: 60, user: actor, planning: { id: 2, expectedUpdatedAt: second.updatedAt, updates: {} } })).ok).toBe(true);
  await undoPlanning("production", 1, (await prod()).updatedAt, actor);
  expect((await item()).producedQty).toBe(60);
  expect((await db.select().from(productionPlanEntries).where(eq(productionPlanEntries.id, 2)))[0]).toMatchObject({ status: "TERMINE", appliedQty: 60 });
});
it("ne soustrait que sa ligne parmi deux livraisons du même article", async () => {
  await produce();
  await db.update(expeditionPlanEntries).set({ plannedQty: 40, status: "NON_TRAITE" });
  await db.insert(expeditionPlanEntries).values({ id: 2, itemId: 1, orderId: 1, articleName: "Article A", plannedQty: 60, planDate: "2026-10-21", driverName: "Autre chauffeur" });
  expect((await deliver()).status).toBe(200);
  const response = await deliverPlan(new NextRequest("http://test/api/expedition-planning/2", { method: "PUT", body: JSON.stringify({ status: "LIVRE" }) }), { params: Promise.resolve({ id: "2" }) });
  expect(response.status).toBe(200);
  await undoPlanning("expedition", 1, (await exp()).updatedAt, actor);
  expect((await item()).deliveredQty).toBe(60);
  expect((await db.select().from(expeditionPlanEntries).where(eq(expeditionPlanEntries.id, 2)))[0]).toMatchObject({ status: "LIVRE", loadedQty: 60 });
});
it("une double validation de production ne crée qu'un seul lot", async () => {
  const results = await Promise.all([produce(), produce()]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect((await item()).producedQty).toBe(100);
  expect(await db.select().from(productionBatches)).toHaveLength(1);
});
it("un échec d'audit de retour d'expédition laisse la livraison intégralement inchangée", async () => {
  await produce(); await deliver(); const before = await exp();
  await fixture.client.exec("ALTER TABLE activity_logs ADD CONSTRAINT reject_undo CHECK (action <> 'PLANNING_EXPEDITION_UNDO')");
  try {
    await expect(undoPlanning("expedition", 1, before.updatedAt, actor)).rejects.toThrow();
    expect(await exp()).toEqual(before);
    expect((await item()).deliveredQty).toBe(100);
    expect(await db.select().from(expeditionBatches)).toHaveLength(1);
    expect((await db.select().from(orders))[0].productionStatus).toBe("LIVREE");
  } finally { await fixture.client.exec("ALTER TABLE activity_logs DROP CONSTRAINT reject_undo"); }
});
