import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

type ItemRef = { id: SQLWrapper; orderId: SQLWrapper; quantity: SQLWrapper; current: SQLWrapper };
/** Date d’enregistrement du dernier franchissement complet, reconstitué depuis le journal signé.
 * Sans journal cohérent avec le cumul courant, aucune date n'est inventée. */
export function itemCompletionDateSQL(stage: "production" | "expedition", ref?: ItemRef): SQL<string | null> {
  // Références qualifiées fixes : Drizzle retire sinon les préfixes dans un SELECT mono-table,
  // ce qui pourrait corréler le sous-select avec cb.id au lieu de l’article.
  const item = ref || { id: sql.raw('"order_items"."id"'), orderId: sql.raw('"order_items"."order_id"'), quantity: sql.raw('"order_items"."quantity"'),
    current: sql.raw(stage === "production" ? '"order_items"."produced_qty"' : '"order_items"."delivered_qty"') };
  const table = sql.raw(stage === "production" ? "production_batches" : "expedition_batches");
  // production_date peut être une date de planning passée/future : utiliser le mouvement réellement enregistré.
  return sql<string | null>`(CASE WHEN ${item.quantity} > 0 AND ${item.current} >= ${item.quantity}
    AND ${item.current} = (SELECT COALESCE(SUM(cb.quantity), 0) FROM ${table} cb WHERE cb.item_id = ${item.id} AND cb.order_id = ${item.orderId})
    THEN (SELECT CASE WHEN done.day ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN done.day ELSE NULL END FROM (
      SELECT cb.id, cb.created_at, cb.quantity, to_char(cb.created_at, 'YYYY-MM-DD') AS day,
        SUM(cb.quantity) OVER (ORDER BY cb.created_at, cb.id ROWS UNBOUNDED PRECEDING) AS running
      FROM ${table} cb WHERE cb.item_id = ${item.id} AND cb.order_id = ${item.orderId}
    ) done WHERE done.running >= ${item.quantity} AND done.running - done.quantity < ${item.quantity}
    ORDER BY done.created_at DESC, done.id DESC LIMIT 1) ELSE NULL END)`;
}
export function orderCompletionDateSQL(stage: "production" | "expedition"): SQL<string | null> {
  const date = itemCompletionDateSQL(stage, { id: sql`ci.id`, orderId: sql`ci.order_id`, quantity: sql`ci.quantity`,
    current: stage === "production" ? sql`ci.produced_qty` : sql`ci.delivered_qty` });
  return sql<string | null>`(SELECT CASE WHEN count(*) > 0 AND count(finished.day) = count(*) THEN max(finished.day) ELSE NULL END
    FROM (SELECT ${date} AS day FROM order_items ci WHERE ci.order_id = ${sql.raw('"orders"."id"')} AND ci.quantity > 0) finished)`;
}
