import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPlanningDatabase } from "./helpers/planning-db";
import { orders, orderItems, productionBatches, expeditionBatches } from "@/db/schema";
import { itemCompletionDateSQL, orderCompletionDateSQL } from "../completion-dates";
let fixture: Awaited<ReturnType<typeof createPlanningDatabase>>;
beforeAll(async () => { fixture = await createPlanningDatabase(); }, 30000);
afterAll(async () => { await fixture?.client.close(); });
beforeEach(async () => {
  await fixture.client.exec("TRUNCATE orders, order_items, production_batches, expedition_batches RESTART IDENTITY");
  await fixture.database.insert(orders).values({ id: 1, orderNumber: "BC-1", clientId: 1, agencyId: 1, orderDate: "2026-01-01" });
  await fixture.database.insert(orderItems).values({ id: 1, orderId: 1, articleName: "A", quantity: 100, producedQty: 100, deliveredQty: 100 });
});
async function batch(id: number, qty: number, total: number, day: string, stage: "production" | "expedition" = "production", itemId = 1) {
  const common = { id, orderId: 1, itemId, quantity: qty, cumulativeTotal: total, createdAt: `${day} 12:00:${String(id).padStart(2, "0")}` };
  if (stage === "production") await fixture.database.insert(productionBatches).values({ ...common, producedBy: "Test", productionDate: day });
  else await fixture.database.insert(expeditionBatches).values({ ...common, deliveredBy: "Test", deliveryDate: day });
}
async function dates() {
  return (await fixture.database.select({ production: itemCompletionDateSQL("production"), expedition: itemCompletionDateSQL("expedition") }).from(orderItems).where(eq(orderItems.id, 1)))[0];
}
it("trouve la date où la quantité entière est atteinte, et non celle du premier lot", async () => {
  await batch(1, 40, 40, "2026-01-03"); await batch(2, 60, 100, "2026-01-06");
  await batch(1, 90, 90, "2026-01-10", "expedition"); await batch(2, 10, 100, "2026-01-12", "expedition");
  expect(await dates()).toEqual({ production: "2026-01-06", expedition: "2026-01-12" });
});
it("un surplus après la fin ne décale pas la date de fin", async () => {
  await batch(1, 100, 100, "2026-01-03"); await batch(2, 20, 120, "2026-01-09");
  await fixture.database.update(orderItems).set({ producedQty: 120 }).where(eq(orderItems.id, 1));
  expect((await dates()).production).toBe("2026-01-03");
});
it("une annulation exacte du lot efface la fin, et une nouvelle application donne la nouvelle date", async () => {
  await batch(1, 100, 100, "2026-01-03"); await batch(2, -100, 0, "2026-01-04");
  await fixture.database.update(orderItems).set({ producedQty: 0 }).where(eq(orderItems.id, 1));
  expect((await dates()).production).toBeNull();
  await batch(3, 100, 100, "2026-01-09");
  await fixture.database.update(orderItems).set({ producedQty: 100 }).where(eq(orderItems.id, 1));
  expect((await dates()).production).toBe("2026-01-09");
});
it("les corrections d’expédition sont également signées", async () => {
  await batch(1, 100, 100, "2026-01-03", "expedition"); await batch(2, -20, 80, "2026-01-04", "expedition"); await batch(3, 20, 100, "2026-01-10", "expedition");
  expect((await dates()).expedition).toBe("2026-01-10");
});
it("ne fabrique pas de date lorsque le cumul a été importé ou le journal est incomplet", async () => {
  expect(await dates()).toEqual({ production: null, expedition: null });
  await batch(1, 20, 100, "2026-01-03");
  expect((await dates()).production).toBeNull();
});
it("la commande entière finit à la dernière fin de ses articles et jamais sur une compensation", async () => {
  await batch(1, 100, 100, "2026-01-03");
  await fixture.database.insert(orderItems).values({ id: 2, orderId: 1, articleName: "B", quantity: 100, producedQty: 100 });
  const read = async () => (await fixture.database.select({ day: orderCompletionDateSQL("production") }).from(orders))[0].day;
  expect(await read()).toBeNull();
  await batch(2, 100, 100, "2026-01-10", "production", 2);
  expect(await read()).toBe("2026-01-10");
  await fixture.database.update(orderItems).set({ producedQty: 0 }).where(eq(orderItems.id, 2));
  expect(await read()).toBeNull();
});
it("les commandes vides et les quantités nulles n’ont pas de fin artificielle", async () => {
  await fixture.database.update(orderItems).set({ quantity: 0 }).where(eq(orderItems.id, 1));
  expect((await dates()).production).toBeNull();
  expect((await fixture.database.select({ day: orderCompletionDateSQL("production") }).from(orders))[0].day).toBeNull();
});

it("ne confond pas la date de planning déclarée avec la date du mouvement réellement enregistré", async () => {
  await fixture.database.insert(productionBatches).values({ itemId: 1, orderId: 1, quantity: 100, cumulativeTotal: 100, producedBy: "Test", productionDate: "2026-01-01", createdAt: "2026-01-15 10:00:00" });
  expect((await dates()).production).toBe("2026-01-15");
});
