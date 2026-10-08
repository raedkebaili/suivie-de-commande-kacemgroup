export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients, expeditionPlanEntries, orderItems, orders } from "@/db/schema";
import { and, asc, eq, ne } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

const MANAGER_ROLES = ["superadmin", "planification"];

type ExpeditionPlanStatus = "NON_TRAITE" | "EN_COURS" | "LIVRE" | "ANNULE";

function canManage(role: string) {
  return MANAGER_ROLES.includes(role);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Compatibilité avec les premières lignes éventuellement créées par la
// version précédente du module : PLANIFIE = NON_TRAITE, TERMINE = LIVRE.
function normalizeStatus(status: string): ExpeditionPlanStatus {
  if (status === "PLANIFIE") return "NON_TRAITE";
  if (status === "TERMINE") return "LIVRE";
  if (["EN_COURS", "LIVRE", "ANNULE"].includes(status)) return status as ExpeditionPlanStatus;
  return "NON_TRAITE";
}

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (![...MANAGER_ROLES, "gerant"].includes(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  const driver = params.get("driver")?.trim();
  const search = params.get("search")?.trim().toLowerCase();

  const conditions = [];
  if (date && date !== "all") conditions.push(eq(expeditionPlanEntries.planDate, date));
  if (driver && driver !== "all") conditions.push(eq(expeditionPlanEntries.driverName, driver));

  const rows = await db.select({
    id: expeditionPlanEntries.id,
    planDate: expeditionPlanEntries.planDate,
    itemId: expeditionPlanEntries.itemId,
    orderId: expeditionPlanEntries.orderId,
    articleName: expeditionPlanEntries.articleName,
    orderNumber: expeditionPlanEntries.orderNumber,
    clientName: expeditionPlanEntries.clientName,
    plannedQty: expeditionPlanEntries.plannedQty,
    loadedQty: expeditionPlanEntries.loadedQty,
    driverName: expeditionPlanEntries.driverName,
    status: expeditionPlanEntries.status,
    note: expeditionPlanEntries.note,
    createdByName: expeditionPlanEntries.createdByName,
    updatedByName: expeditionPlanEntries.updatedByName,
    updatedAt: expeditionPlanEntries.updatedAt,
    itemQuantity: orderItems.quantity,
    itemDeliveredQty: orderItems.deliveredQty,
    itemProducedQty: orderItems.producedQty,
    productionStatus: orders.productionStatus,
    affaire: orders.affaire,
    priority: orders.priority,
  })
    .from(expeditionPlanEntries)
    .leftJoin(orderItems, eq(expeditionPlanEntries.itemId, orderItems.id))
    .leftJoin(orders, eq(expeditionPlanEntries.orderId, orders.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(expeditionPlanEntries.planDate), asc(expeditionPlanEntries.driverName), asc(expeditionPlanEntries.id));

  const plans = rows.map((row) => ({ ...row, status: normalizeStatus(row.status) }));
  const filteredPlans = search
    ? plans.filter((plan) => [plan.articleName, plan.orderNumber, plan.clientName, plan.affaire, plan.driverName]
      .some((value) => String(value || "").toLowerCase().includes(search)))
    : plans;

  const driverRows = await db.selectDistinct({ driverName: expeditionPlanEntries.driverName })
    .from(expeditionPlanEntries)
    .orderBy(asc(expeditionPlanEntries.driverName));

  return NextResponse.json({
    plans: filteredPlans,
    drivers: driverRows.map((row) => row.driverName).filter(Boolean),
  });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const body = await request.json();
    const planDate = String(body.planDate || "");
    const itemId = Number.parseInt(String(body.itemId), 10);
    const plannedQty = Number.parseInt(String(body.plannedQty), 10);
    const driverName = String(body.driverName || "").trim();
    const note = String(body.note || "").trim() || null;

    if (!validDate(planDate)) return NextResponse.json({ error: "Date de chargement invalide" }, { status: 400 });
    if (!Number.isInteger(itemId) || itemId <= 0) return NextResponse.json({ error: "Article invalide" }, { status: 400 });
    if (!Number.isInteger(plannedQty) || plannedQty <= 0) return NextResponse.json({ error: "La quantité à livrer doit être supérieure à zéro" }, { status: 400 });
    if (!driverName) return NextResponse.json({ error: "Le chauffeur/porteur est requis" }, { status: 400 });

    const [row] = await db.select({
      itemId: orderItems.id,
      orderId: orderItems.orderId,
      articleName: orderItems.articleName,
      quantity: orderItems.quantity,
      deliveredQty: orderItems.deliveredQty,
      producedQty: orderItems.producedQty,
      orderNumber: orders.orderNumber,
      productionStatus: orders.productionStatus,
      affaire: orders.affaire,
      priority: orders.priority,
      clientName: clients.name,
    })
      .from(orderItems)
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(clients, eq(orders.clientId, clients.id))
      .where(eq(orderItems.id, itemId))
      .limit(1);

    if (!row) return NextResponse.json({ error: "Article introuvable" }, { status: 404 });
    if (row.productionStatus === "ANNULEE") return NextResponse.json({ error: "Impossible de planifier une commande annulée" }, { status: 400 });

    // Le planning d'expédition ne peut travailler que sur le stock produit,
    // jamais sur la quantité totale commandée.
    const availableToDeliver = Math.max(0, (row.producedQty || 0) - (row.deliveredQty || 0));
    if (availableToDeliver <= 0) return NextResponse.json({ error: "Aucune quantité produite disponible à livrer pour cet article" }, { status: 400 });
    if (plannedQty > availableToDeliver) {
      return NextResponse.json({ error: `Quantité maximale à livrer : ${availableToDeliver}` }, { status: 400 });
    }

    const [duplicate] = await db.select({ id: expeditionPlanEntries.id })
      .from(expeditionPlanEntries)
      .where(and(
        eq(expeditionPlanEntries.planDate, planDate),
        eq(expeditionPlanEntries.itemId, itemId),
        eq(expeditionPlanEntries.driverName, driverName),
        ne(expeditionPlanEntries.status, "ANNULE"),
        ne(expeditionPlanEntries.status, "LIVRE"),
        ne(expeditionPlanEntries.status, "TERMINE"),
      ))
      .limit(1);
    if (duplicate) return NextResponse.json({ error: "Cet article est déjà planifié pour ce chauffeur à cette date" }, { status: 409 });

    const [created] = await db.insert(expeditionPlanEntries).values({
      planDate,
      itemId: row.itemId,
      orderId: row.orderId,
      articleName: row.articleName,
      orderNumber: row.orderNumber,
      clientName: row.clientName,
      plannedQty,
      loadedQty: 0,
      driverName,
      status: "NON_TRAITE",
      note,
      createdById: user.id,
      createdByName: user.fullName,
      updatedByName: user.fullName,
    }).returning();

    await logActivity(user.id, user.username, "EXPEDITION_PLANNING_ADD",
      `${row.articleName} — ${plannedQty} unité(s) à livrer, ${driverName}, le ${planDate}`);
    return NextResponse.json({ plan: { ...created, status: "NON_TRAITE" } }, { status: 201 });
  } catch (error) {
    console.error("Erreur création planning expédition:", error);
    return NextResponse.json({ error: "Erreur lors de la création du planning d'expédition" }, { status: 500 });
  }
}
