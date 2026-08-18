export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, clients, agencies, itemTechnicalComponents } from "@/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { logActivity, getUserFromHeaders, notifyRole } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/order-number";

async function auth(r: Request, roles?: string[]) {
  const u = await getUserFromHeaders(r);
  if (!u) return { ok: false as const, status: 401, error: "Non authentifié" };
  if (roles && !roles.includes(u.role)) return { ok: false as const, status: 403, error: "Accès refusé" };
  return { ok: true as const, user: u };
}

export async function GET(request: NextRequest) {
  const a = await auth(request); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status"); const agencyId = sp.get("agencyId"); const priority = sp.get("priority");
  const conds = [];
  if (status) conds.push(eq(orders.status, status));
  if (agencyId) conds.push(eq(orders.agencyId, parseInt(agencyId)));
  if (priority) conds.push(eq(orders.priority, priority));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const data = await db.select({
    id: orders.id, orderNumber: orders.orderNumber, orderDate: orders.orderDate,
    priority: orders.priority, clientId: orders.clientId, agencyId: orders.agencyId,
    status: orders.status, productionStatus: orders.productionStatus, statusReason: orders.statusReason, affaire: orders.affaire,
    cancelReason: orders.cancelReason, cancelledBy: orders.cancelledBy, cancelledAt: orders.cancelledAt,
    createdBy: orders.createdBy, createdByName: orders.createdByName,
    updatedBy: orders.updatedBy,
    lockedBy: orders.lockedBy, lockedByName: orders.lockedByName, lockedAt: orders.lockedAt,
    techCompleted: orders.techCompleted, planifCompleted: orders.planifCompleted,
    createdAt: orders.createdAt, updatedAt: orders.updatedAt,
    clientName: clients.name, clientCode: clients.code,
    agencyName: agencies.name, agencyCode: agencies.code,
  }).from(orders).leftJoin(clients, eq(orders.clientId, clients.id)).leftJoin(agencies, eq(orders.agencyId, agencies.id)).where(where).orderBy(desc(orders.createdAt));

  const oids = data.map(o => o.id);
  let allItems: (typeof orderItems.$inferSelect)[] = [];
  if (oids.length > 0) allItems = await db.select().from(orderItems).where(inArray(orderItems.orderId, oids));
  const itemIds = allItems.map(item => item.id);
  const allTechnicalComponents = itemIds.length > 0
    ? await db.select().from(itemTechnicalComponents).where(inArray(itemTechnicalComponents.itemId, itemIds))
    : [];

  return NextResponse.json({
    orders: data.map(o => {
      const items = allItems.filter(i => i.orderId === o.id).map(item => ({
        ...item,
        technicalComponents: allTechnicalComponents.filter(component => component.itemId === item.id),
      }));
      return {
        ...o,
        items,
        totalQty: items.reduce((s, i) => s + i.quantity, 0),
        totalDelivered: items.reduce((s, i) => s + (i.deliveredQty || 0), 0),
        totalProduced: items.reduce((s, i) => s + (i.producedQty || 0), 0),
        totalRemaining: items.reduce((s, i) => s + i.quantity - (i.deliveredQty || 0), 0),
      };
    })
  });
}

export async function POST(request: NextRequest) {
  const a = await auth(request, ["superadmin", "commercial"]); 
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  
  const body = await request.json();
  const { orderDate, clientId, agencyId, affaire, items: itemsList } = body;
  const needAgency = body.status !== "SUR_STOCK";
  
  // Validation des champs requis (le numéro de commande n'est plus requis du client)
  if (!clientId || (needAgency && !agencyId) || !itemsList || itemsList.length === 0) {
    return NextResponse.json({ 
      error: needAgency ? "Client, agence et articles requis" : "Client et articles requis" 
    }, { status: 400 });
  }

  // Générer automatiquement le numéro de commande (thread-safe)
  let orderNumber: string;
  try {
    orderNumber = await generateOrderNumber();
  } catch (error) {
    console.error("Erreur génération numéro commande:", error);
    return NextResponse.json({ 
      error: "Erreur lors de la génération du numéro de commande" 
    }, { status: 500 });
  }

  // Créer la commande
  const [created] = await db.insert(orders).values({
    orderNumber, 
    orderDate: orderDate || new Date().toISOString().split("T")[0],
    priority: "NORMALE", 
    clientId: parseInt(clientId), 
    agencyId: agencyId ? parseInt(agencyId) : 0,
    affaire: affaire || null, 
    status: body.status || "PREVISION",
    productionStatus: "EN_INSTANCE",
    createdBy: a.user.id, 
    createdByName: a.user.fullName,
  }).returning();

  // Créer les articles
  for (const item of itemsList) {
    if (!item.articleName?.trim()) continue;
    await db.insert(orderItems).values({
      orderId: created.id, 
      articleName: item.articleName,
      quantity: item.quantity || 1, 
      note: item.note || null,
      clientSpec: item.clientSpec || null,
      productionUnit: item.productionUnit || null,
      plannedLoadingDate: item.plannedLoadingDate || null,
      deliveredQty: 0, 
      producedQty: 0,
      unitPrice: item.unitPrice || null, 
      description: item.description || null,
    });
  }

  // Logger et notifier
  await logActivity(a.user.id, a.user.username, "CREATE_ORDER", `Commande: ${orderNumber}`);
  await notifyRole("technique", "info", `Nouvelle commande #${orderNumber}`, `Commande ${orderNumber} en attente de traitement technique`, created.id);
  await notifyRole("planification", "info", `Nouvelle commande #${orderNumber}`, `Commande ${orderNumber} créée par ${a.user.fullName}`, created.id);

  return NextResponse.json({ order: created, orderNumber }, { status: 201 });
}
