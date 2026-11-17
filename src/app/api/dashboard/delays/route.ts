export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { getUserFromHeaders } from "@/lib/auth";
import { agencyScopeForUser } from "@/lib/agency-access";
import { itemCompletionDateSQL } from "@/lib/completion-dates";
import { buildDelayReport, parseDelayTarget } from "@/lib/delay-statistics";
import { todayISO } from "@/lib/production-planning-constants";

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  let productionTarget, expeditionTarget;
  try { productionTarget = parseDelayTarget(params.get("productionDays")); expeditionTarget = parseDelayTarget(params.get("expeditionDays")); }
  catch { return NextResponse.json({ error: "Délai cible invalide (0 à 36500 jours)" }, { status: 400 }); }
  const scope = agencyScopeForUser(user);
  const items = await db.select({
    orderId: orders.id, orderDate: orders.orderDate, quantity: orderItems.quantity,
    producedQty: orderItems.producedQty, deliveredQty: orderItems.deliveredQty,
    factory: sql<string | null>`COALESCE(NULLIF(trim(${orderItems.productionUnit}), ''),
      (SELECT p.factory_name FROM production_plan_entries p WHERE p.item_id = ${orderItems.id} AND p.order_id = ${orders.id} AND p.status <> 'ANNULE' ORDER BY p.id DESC LIMIT 1))`,
    productionCompletedOn: itemCompletionDateSQL("production"), expeditionCompletedOn: itemCompletionDateSQL("expedition"),
  }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(scope ? inArray(orders.agencyId, scope) : undefined, inArray(orders.status, ["BON_COMMANDE", "SUR_STOCK"]),
      sql`COALESCE(${orders.productionStatus}, '') <> 'ANNULEE'`));
  const today = todayISO();
  return NextResponse.json({ ...buildDelayReport(items, productionTarget, expeditionTarget, today), productionTarget, expeditionTarget, today });
}
