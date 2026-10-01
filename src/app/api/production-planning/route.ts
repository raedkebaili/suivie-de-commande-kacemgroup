export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients, orderItems, orders, productionPlanEntries } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { ensurePlanningColors } from "@/lib/production-planning";
import { PLANNING_MANAGER_ROLES, todayISO } from "@/lib/production-planning-constants";

function canManage(role: string) {
  return (PLANNING_MANAGER_ROLES as readonly string[]).includes(role);
}

/**
 * GET /api/production-planning?date=YYYY-MM-DD
 * Planning d'une journée : lignes + état d'avancement réel des articles.
 * Lecture : tout utilisateur authentifié (le tableau des commandes a besoin
 * de connaître les articles en cours de production pour l'alerte visuelle).
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const date = sp.get("date") || todayISO();

  try {
    await ensurePlanningColors();

    const rows = await db
      .select({
        id: productionPlanEntries.id,
        planDate: productionPlanEntries.planDate,
        itemId: productionPlanEntries.itemId,
        orderId: productionPlanEntries.orderId,
        articleName: productionPlanEntries.articleName,
        orderNumber: productionPlanEntries.orderNumber,
        clientName: productionPlanEntries.clientName,
        plannedQty: productionPlanEntries.plannedQty,
        status: productionPlanEntries.status,
        reason: productionPlanEntries.reason,
        appliedQty: productionPlanEntries.appliedQty,
        appliedAt: productionPlanEntries.appliedAt,
        createdByName: productionPlanEntries.createdByName,
        updatedByName: productionPlanEntries.updatedByName,
        updatedAt: productionPlanEntries.updatedAt,
        // Avancement réel de l'article (source : order_items)
        itemQuantity: orderItems.quantity,
        itemProducedQty: orderItems.producedQty,
        itemDeliveredQty: orderItems.deliveredQty,
        productionStatus: orders.productionStatus,
      })
      .from(productionPlanEntries)
      .leftJoin(orderItems, eq(productionPlanEntries.itemId, orderItems.id))
      .leftJoin(orders, eq(productionPlanEntries.orderId, orders.id))
      .where(eq(productionPlanEntries.planDate, date))
      .orderBy(asc(productionPlanEntries.id));

    return NextResponse.json({ date, entries: rows });
  } catch (error) {
    console.error("Erreur lecture planning:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération du planning" }, { status: 500 });
  }
}

/**
 * POST /api/production-planning
 * Ajoute un ou plusieurs articles au planning d'une journée.
 * Rôles : superadmin, planification.
 * Body: { date?: "YYYY-MM-DD", entries: [{ itemId, plannedQty }] }
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const body = await request.json();
    const date = String(body.date || todayISO());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Date invalide (format attendu AAAA-MM-JJ)" }, { status: 400 });
    }

    const list = Array.isArray(body.entries) ? body.entries : [];
    if (list.length === 0) return NextResponse.json({ error: "Aucun article à planifier" }, { status: 400 });

    const created: unknown[] = [];
    const skipped: { itemId: number; reason: string }[] = [];

    for (const raw of list) {
      const itemId = parseInt(String(raw.itemId));
      const plannedQty = parseInt(String(raw.plannedQty)) || 0;
      if (!Number.isFinite(itemId)) continue;
      if (plannedQty <= 0) { skipped.push({ itemId, reason: "Quantité invalide" }); continue; }

      // L'article doit exister ; on récupère la commande et le client pour l'historique
      const [row] = await db
        .select({
          itemId: orderItems.id, articleName: orderItems.articleName, quantity: orderItems.quantity,
          producedQty: orderItems.producedQty, orderId: orderItems.orderId,
          orderNumber: orders.orderNumber, productionStatus: orders.productionStatus,
          clientName: clients.name,
        })
        .from(orderItems)
        .leftJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(clients, eq(orders.clientId, clients.id))
        .where(eq(orderItems.id, itemId)).limit(1);

      if (!row) { skipped.push({ itemId, reason: "Article introuvable" }); continue; }
      if (row.productionStatus === "ANNULEE") { skipped.push({ itemId, reason: "Commande annulée" }); continue; }

      // Une seule ligne active par article et par journée (évite les doublons)
      const [dup] = await db.select({ id: productionPlanEntries.id })
        .from(productionPlanEntries)
        .where(and(
          eq(productionPlanEntries.planDate, date),
          eq(productionPlanEntries.itemId, itemId),
        )).limit(1);
      if (dup) { skipped.push({ itemId, reason: "Déjà planifié ce jour" }); continue; }

      const [entry] = await db.insert(productionPlanEntries).values({
        planDate: date,
        itemId: row.itemId,
        orderId: row.orderId,
        articleName: row.articleName,
        orderNumber: row.orderNumber,
        clientName: row.clientName,
        plannedQty,
        // État neutre de départ : la production ne démarre (et ne clignote)
        // qu'après bascule manuelle du planificateur en « En cours ».
        status: "EN_ATTENTE",
        createdById: user.id,
        createdByName: user.fullName,
        updatedByName: user.fullName,
      }).returning();
      created.push(entry);
    }

    if (created.length > 0) {
      await logActivity(user.id, user.username, "PLANNING_ADD",
        `${created.length} article(s) planifié(s) le ${date}`);
    }

    return NextResponse.json({ created, skipped }, { status: created.length > 0 ? 201 : 200 });
  } catch (error) {
    console.error("Erreur création planning:", error);
    return NextResponse.json({ error: "Erreur lors de l'ajout au planning" }, { status: 500 });
  }
}
