export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agencies, clients, itemTechnicalComponents, orderItems, orders } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

/**
 * GET /api/telegestion
 * Articles de la famille TÉLÉGESTION, regroupés par commande.
 *
 * Un article entre dans la famille si le commercial l'a marqué
 * (order_items.is_telegestion). Les composants techniques de télégestion
 * déjà saisis sont joints pour préparer le traitement technique.
 *
 * Lecture : tout utilisateur authentifié (l'onglet est destiné au service
 * technique, le gating d'affichage est fait côté navigation).
 * Query : q (recherche), status (état production), pending=1 (non traités)
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") || "").trim().toLowerCase();
  const productionStatus = sp.get("status");
  const pendingOnly = sp.get("pending") === "1";

  try {
    const conds = [eq(orderItems.isTelegestion, true)];
    if (productionStatus) conds.push(eq(orders.productionStatus, productionStatus));

    const rows = await db
      .select({
        itemId: orderItems.id,
        orderId: orderItems.orderId,
        articleName: orderItems.articleName,
        quantity: orderItems.quantity,
        producedQty: orderItems.producedQty,
        deliveredQty: orderItems.deliveredQty,
        clientSpec: orderItems.clientSpec,
        note: orderItems.note,
        productionUnit: orderItems.productionUnit,
        orderNumber: orders.orderNumber,
        orderDate: orders.orderDate,
        affaire: orders.affaire,
        priority: orders.priority,
        status: orders.status,
        productionStatus: orders.productionStatus,
        clientName: clients.name,
        agencyName: agencies.name,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(clients, eq(orders.clientId, clients.id))
      .leftJoin(agencies, eq(orders.agencyId, agencies.id))
      .where(and(...conds))
      .orderBy(desc(orders.createdAt));

    // Composants techniques de télégestion déjà renseignés (traitement en cours)
    const itemIds = rows.map(r => r.itemId);
    const components = itemIds.length > 0
      ? await db.select().from(itemTechnicalComponents)
          .where(and(inArray(itemTechnicalComponents.itemId, itemIds), eq(itemTechnicalComponents.isTelegestion, true)))
      : [];

    let items = rows.map(r => {
      const comps = components.filter(c => c.itemId === r.itemId);
      return { ...r, telegestionComponents: comps, treated: comps.length > 0 };
    });

    if (pendingOnly) items = items.filter(i => !i.treated);
    if (q.length >= 2) {
      items = items.filter(i =>
        (i.articleName || "").toLowerCase().includes(q) ||
        (i.orderNumber || "").toLowerCase().includes(q) ||
        (i.clientName || "").toLowerCase().includes(q) ||
        (i.affaire || "").toLowerCase().includes(q));
    }

    // Regroupement par commande
    const map = new Map<number, {
      orderId: number; orderNumber: string; orderDate: string | null; affaire: string | null;
      clientName: string | null; agencyName: string | null; priority: string;
      status: string; productionStatus: string | null; items: typeof items;
    }>();
    for (const i of items) {
      let g = map.get(i.orderId);
      if (!g) {
        g = {
          orderId: i.orderId, orderNumber: i.orderNumber, orderDate: i.orderDate, affaire: i.affaire,
          clientName: i.clientName, agencyName: i.agencyName, priority: i.priority,
          status: i.status, productionStatus: i.productionStatus, items: [],
        };
        map.set(i.orderId, g);
      }
      g.items.push(i);
    }
    const groups = [...map.values()];

    return NextResponse.json({
      groups,
      totals: {
        orders: groups.length,
        items: items.length,
        treated: items.filter(i => i.treated).length,
        pending: items.filter(i => !i.treated).length,
        quantity: items.reduce((s, i) => s + (i.quantity || 0), 0),
      },
    });
  } catch (error) {
    console.error("Erreur lecture télégestion:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des articles de télégestion" }, { status: 500 });
  }
}
