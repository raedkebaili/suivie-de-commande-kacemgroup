export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, clients, agencies, orderItems } from "@/db/schema";
import { and, desc, or, ilike, eq, inArray } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";
import { agencyScopeForUser } from "@/lib/agency-access";

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") || "";
  if (q.length < 2) return NextResponse.json({ orders: [], items: [], clients: [] });

  const like = `%${q}%`;
  const agencyScope = agencyScopeForUser(user);
  const orderSearch = or(ilike(orders.orderNumber, like), ilike(orders.affaire, like), ilike(clients.name, like), ilike(clients.code, like));

  const foundOrders = await db.select({
    id: orders.id,
    order_number: orders.orderNumber,
    affaire: orders.affaire,
    client_name: clients.name,
    agency_name: agencies.name,
  }).from(orders)
    .leftJoin(clients, eq(orders.clientId, clients.id))
    .leftJoin(agencies, eq(orders.agencyId, agencies.id))
    .where(agencyScope ? and(inArray(orders.agencyId, agencyScope), orderSearch) : orderSearch)
    .orderBy(desc(orders.createdAt))
    .limit(20);

  const foundItems = await db.select({
    id: orderItems.id,
    article_name: orderItems.articleName,
    order_number: orders.orderNumber,
    client_name: clients.name,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(clients, eq(orders.clientId, clients.id))
    .where(agencyScope
      ? and(inArray(orders.agencyId, agencyScope), ilike(orderItems.articleName, like))
      : ilike(orderItems.articleName, like))
    .orderBy(desc(orderItems.id))
    .limit(20);

  const foundClients = await db.select().from(clients)
    .where(or(ilike(clients.name, like), ilike(clients.code, like)))
    .limit(10);

  return NextResponse.json({ orders: foundOrders, items: foundItems, clients: foundClients, query: q });
}
