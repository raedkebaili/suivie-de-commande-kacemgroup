/** Le prédicat réellement utilisé par l'API est exécuté dans PostgreSQL embarqué (PGlite). */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { orders, orderItems } from "@/db/schema";
import { materialDemandScope } from "../material-demand-scope";
let database: PGlite;
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE orders (id integer PRIMARY KEY, status text, production_status text, agency_id integer DEFAULT 7);
    CREATE TABLE order_items (id integer PRIMARY KEY, order_id integer REFERENCES orders(id), quantity integer DEFAULT 100, produced_qty integer DEFAULT 0, delivered_qty integer DEFAULT 0);
    CREATE TABLE production_batches (order_id integer REFERENCES orders(id), quantity integer);
    CREATE TABLE expedition_batches (order_id integer REFERENCES orders(id), quantity integer);
    CREATE TABLE production_plan_entries (order_id integer REFERENCES orders(id), status text DEFAULT 'EN_ATTENTE', applied_qty integer DEFAULT 0, applied_at text);
  `);
}, 30_000);
afterAll(async () => { await database?.close(); });
beforeEach(async () => {
  await database.exec(`TRUNCATE production_plan_entries, production_batches, expedition_batches, order_items, orders;
    INSERT INTO orders (id,status,production_status) VALUES (1,'BON_COMMANDE','EN_INSTANCE');
    INSERT INTO order_items (id,order_id) VALUES (11,1);`);
});
async function eligible(extra?: ReturnType<typeof eq>) {
  const query = new PgDialect().sqlToQuery(sql`SELECT ${orderItems.id} AS id FROM ${orderItems}
    JOIN ${orders} ON ${orderItems.orderId} = ${orders.id}
    WHERE ${and(materialDemandScope(), extra)} ORDER BY ${orderItems.id}`);
  return (await database.query<{ id: number }>(query.sql, query.params)).rows.map(row => row.id);
}
describe("besoin matière : commandes non traitées uniquement", () => {
  it.each(["PREVISION", "BON_COMMANDE", "SUR_STOCK"])("inclut %s non traité", async status => {
    await database.query("UPDATE orders SET status = $1", [status]);
    expect(await eligible()).toEqual([11]);
  });
  it.each(["EN_INSTANCE", "EN_PRODUCTION", "LIVREE", "ANNULEE", "INCONNU", null])("n'inclut pas l'état commercial non éligible %s", async status => {
    await database.query("UPDATE orders SET status = $1", [status]);
    expect(await eligible()).toEqual([]);
  });
  it.each(["EN_PRODUCTION", "LIVREE", "ANNULEE", "PRET_A_LIVRER", "EN_ATTENTE_LIVRAISON", "INCONNU", null])("exclut l'état de production %s malgré un bon de commande", async status => {
    await database.query("UPDATE orders SET production_status = $1", [status]);
    expect(await eligible()).toEqual([]);
  });
  it("exclut une commande prête à livrer même restée EN_INSTANCE", async () => {
    await database.exec("UPDATE order_items SET produced_qty = quantity");
    expect(await eligible()).toEqual([]);
  });
  it("exclut une commande livrée même si ses statuts n'ont pas changé", async () => {
    await database.exec("UPDATE order_items SET delivered_qty = quantity");
    expect(await eligible()).toEqual([]);
  });
  it.each(["produced_qty", "delivered_qty"])("un début de traitement (%s) exclut aussi les autres articles de la commande", async column => {
    await database.exec(`INSERT INTO order_items (id,order_id) VALUES (12,1); UPDATE order_items SET ${column} = 1 WHERE id = 11;`);
    expect(await eligible()).toEqual([]);
  });
  it.each(["production_batches", "expedition_batches"])("un lot réel dans %s exclut la commande même si les cumuls sont encore à zéro", async table => {
    await database.exec(`INSERT INTO ${table} (order_id, quantity) VALUES (1,1)`);
    expect(await eligible()).toEqual([]);
  });
  it.each(["EN_COURS", "TERMINE"])("un planning %s empêche de compter à nouveau ses matières", async status => {
    await database.query("INSERT INTO production_plan_entries (order_id,status) VALUES (1,$1)", [status]);
    expect(await eligible()).toEqual([]);
  });
  it.each(["EN_ATTENTE", "ANNULE", "SUSPENDU"])("un planning %s sans production appliquée ne consomme pas de matière", async status => {
    await database.query("INSERT INTO production_plan_entries (order_id,status) VALUES (1,$1)", [status]);
    expect(await eligible()).toEqual([11]);
  });
  it("un ancien planning ayant déjà appliqué une quantité reste excluant même après changement de statut", async () => {
    await database.exec("INSERT INTO production_plan_entries (order_id,status,applied_qty) VALUES (1,'ANNULE',1)");
    expect(await eligible()).toEqual([]);
  });
  it("une date d'application constitue également une preuve de traitement", async () => {
    await database.exec("INSERT INTO production_plan_entries (order_id,status,applied_at) VALUES (1,'EN_ATTENTE','2026-10-21')");
    expect(await eligible()).toEqual([]);
  });
  it("ne transforme pas une quantité nulle/négative en besoin", async () => {
    await database.exec("UPDATE order_items SET quantity = 0; INSERT INTO order_items (id,order_id,quantity) VALUES (12,1,-1),(13,1,10)");
    expect(await eligible()).toEqual([13]);
  });
  it("la règle est recalculée à chaque lecture et aucun filtre ne la contourne", async () => {
    expect(await eligible()).toEqual([11]);
    await database.exec("UPDATE orders SET production_status = 'EN_PRODUCTION'");
    expect(await eligible(eq(orders.productionStatus, "EN_PRODUCTION"))).toEqual([]);
    await database.exec("UPDATE orders SET production_status = 'EN_INSTANCE'; UPDATE order_items SET produced_qty = 1");
    expect(await eligible()).toEqual([]);
  });
  it("préserve le périmètre agence et l'éligibilité des autres commandes", async () => {
    await database.exec(`INSERT INTO orders (id,status,production_status,agency_id) VALUES (2,'PREVISION','EN_INSTANCE',8);
      INSERT INTO order_items (id,order_id) VALUES (21,2);
      UPDATE order_items SET produced_qty = 100 WHERE order_id = 1;`);
    expect(await eligible()).toEqual([21]);
    expect(await eligible(eq(orders.agencyId, 7))).toEqual([]);
  });
});
