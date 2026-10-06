export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, clients, agencies, itemTechnicalComponents, driveDocuments, photometricStudies, expeditionPlanEntries } from "@/db/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { logActivity, getUserFromHeaders } from "@/lib/auth";
import { NOTIFICATION_EVENTS, notifyRoles } from "@/lib/notifications";
import { generateOrderNumber } from "@/lib/order-number";
import { agencyScopeForUser } from "@/lib/agency-access";

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
  const photometricOnly = sp.get("photometric") === "1";
  // Filtre sur l'état de PRODUCTION (colonne distincte de l'état commercial).
  // Ajout rétrocompatible : si le paramètre est absent, comportement inchangé.
  const productionStatus = sp.get("productionStatus");
  // Filtre par USINE : retient les commandes ayant au moins un article dont
  // l'unité de production correspond au nom de l'usine (alimenté par le planning).
  const factory = sp.get("factory");
  const conds = [];
  const agencyScope = agencyScopeForUser(a.user);
  if (agencyScope) conds.push(inArray(orders.agencyId, agencyScope));
  if (status) conds.push(eq(orders.status, status));
  if (productionStatus) conds.push(eq(orders.productionStatus, productionStatus));
  if (agencyId) conds.push(eq(orders.agencyId, parseInt(agencyId)));
  if (priority) conds.push(eq(orders.priority, priority));
  if (factory) {
    const matching = await db.selectDistinct({ orderId: orderItems.orderId })
      .from(orderItems).where(eq(orderItems.productionUnit, factory));
    const ids = matching.map(m => m.orderId);
    if (ids.length === 0) return NextResponse.json({ orders: [] });
    conds.push(inArray(orders.id, ids));
  }
  // Filtre FAMILLE TÉLÉGESTION : commandes ayant au moins un article marqué
  if (sp.get("telegestion") === "1") {
    const matching = await db.selectDistinct({ orderId: orderItems.orderId })
      .from(orderItems).where(eq(orderItems.isTelegestion, true));
    const ids = matching.map(m => m.orderId);
    if (ids.length === 0) return NextResponse.json({ orders: [] });
    conds.push(inArray(orders.id, ids));
  }
  if (photometricOnly) {
    const matching = await db.selectDistinct({ orderId: photometricStudies.orderId })
      .from(photometricStudies);
    const ids = matching.map((row) => row.orderId).filter((id): id is number => id !== null);
    if (ids.length === 0) return NextResponse.json({ orders: [] });
    conds.push(inArray(orders.id, ids));
  }
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
  const studyRows = oids.length > 0
    ? await db.selectDistinct({ orderId: photometricStudies.orderId })
      .from(photometricStudies).where(inArray(photometricStudies.orderId, oids))
    : [];
  const studyOrderIds = new Set(studyRows.map((row) => row.orderId).filter((id): id is number => id !== null));
  let allItems: (typeof orderItems.$inferSelect)[] = [];
  if (oids.length > 0) allItems = await db.select().from(orderItems).where(inArray(orderItems.orderId, oids));
  const itemIds = allItems.map(item => item.id);
  const allTechnicalComponents = itemIds.length > 0
    ? await db.select().from(itemTechnicalComponents).where(inArray(itemTechnicalComponents.itemId, itemIds))
    : [];
  // Seul l'état EN_COURS est propagé à Commandes : NON_TRAITE reste neutre,
  // LIVRE est déjà représenté par les cumuls réels et ANNULE ne colore pas la ligne.
  const allExpeditionPlans = itemIds.length > 0
    ? await db.select({
        id: expeditionPlanEntries.id,
        itemId: expeditionPlanEntries.itemId,
        status: expeditionPlanEntries.status,
        planDate: expeditionPlanEntries.planDate,
        driverName: expeditionPlanEntries.driverName,
        plannedQty: expeditionPlanEntries.plannedQty,
        note: expeditionPlanEntries.note,
      }).from(expeditionPlanEntries)
        .where(inArray(expeditionPlanEntries.itemId, itemIds))
        .orderBy(desc(expeditionPlanEntries.id))
    : [];
  const activePlanByItem = new Map<number, typeof allExpeditionPlans[number]>();
  const latestPlanByItem = new Map<number, typeof allExpeditionPlans[number]>();
  for (const plan of allExpeditionPlans) {
    if (!latestPlanByItem.has(plan.itemId)) latestPlanByItem.set(plan.itemId, plan);
    if (plan.status === "EN_COURS" && !activePlanByItem.has(plan.itemId)) activePlanByItem.set(plan.itemId, plan);
  }

  // ── Documents associés (gestion documentaire contextuelle) ──────────
  // AJOUT rétrocompatible : 1 requête groupée, champs additifs. Si la table
  // est vide, documentCount = 0 et rien ne change à l'affichage existant.
  const docStats = oids.length > 0
    ? await db.select({
        orderId: driveDocuments.orderId,
        totalCount: sql<number>`count(*)::int`,
        cahierCount: sql<number>`count(*) filter (where ${driveDocuments.category} = 'CAHIER_DES_CHARGES')::int`,
      }).from(driveDocuments)
        .where(inArray(driveDocuments.orderId, oids))
        .groupBy(driveDocuments.orderId)
    : [];
  const docByOrder = new Map(docStats.map(d => [d.orderId, d]));

  return NextResponse.json({
    orders: data.map(o => {
      const items = allItems.filter(i => i.orderId === o.id).map(item => {
        const plan = activePlanByItem.get(item.id);
        const latestPlan = latestPlanByItem.get(item.id);
        return {
          ...item,
          technicalComponents: allTechnicalComponents.filter(component => component.itemId === item.id),
          expeditionPlanStatus: plan?.status || null,
          expeditionPlanDate: latestPlan?.planDate || null,
          expeditionPlanDriverName: latestPlan?.driverName || null,
          expeditionPlanQty: latestPlan?.plannedQty || null,
          expeditionPlanNote: latestPlan?.note || null,
        };
      });
      const docStat = docByOrder.get(o.id);
      return {
        ...o,
        items,
        totalQty: items.reduce((s, i) => s + i.quantity, 0),
        totalDelivered: items.reduce((s, i) => s + (i.deliveredQty || 0), 0),
        totalProduced: items.reduce((s, i) => s + (i.producedQty || 0), 0),
        totalRemaining: items.reduce((s, i) => s + i.quantity - (i.deliveredQty || 0), 0),
        documentCount: docStat ? Number(docStat.totalCount) : 0,
        hasCahierDesCharges: docStat ? Number(docStat.cahierCount) > 0 : false,
        hasPhotometricStudy: studyOrderIds.has(o.id),
      };
    })
  });
}

// Statut commercial unique autorisé au service planification (« Sur Stock / Besoin interne »)
const PLANIF_ALLOWED_STATUS = "SUR_STOCK";

// Agence technique utilisée pour les commandes « Sur Stock / Besoin interne »
// créées sans agence. Le code existant prévoit explicitement que l'agence est
// facultative dans ce cas (needAgency), mais insérait agency_id = 0, ce qui
// violait la clé étrangère (aucune agence d'id 0) et provoquait une erreur 500.
// On résout donc vers une agence dédiée, créée à la demande.
const INTERNAL_AGENCY = { name: "Besoin interne", code: "INTERNE" };

async function resolveInternalAgencyId(): Promise<number> {
  const [existing] = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.code, INTERNAL_AGENCY.code)).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(agencies).values({
    name: INTERNAL_AGENCY.name,
    code: INTERNAL_AGENCY.code,
    address: null,
    active: true,
  }).returning({ id: agencies.id });
  return created.id;
}

export async function POST(request: NextRequest) {
  // Accès limité : le service planification peut créer des commandes, mais
  // UNIQUEMENT à l'état commercial « Sur Stock / Besoin interne ».
  const a = await auth(request, ["superadmin", "commercial", "planification"]);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });

  const body = await request.json();
  const { orderDate, clientId, agencyId, affaire, items: itemsList } = body;

  // Détermination du statut commercial effectif
  let effectiveStatus: string = body.status || "PREVISION";
  if (a.user.role === "planification") {
    // Refus explicite de toute tentative d'un autre état (contrôle serveur,
    // indépendant de l'interface) puis verrouillage sur SUR_STOCK.
    if (body.status && body.status !== PLANIF_ALLOWED_STATUS) {
      return NextResponse.json({
        error: "Le service planification ne peut créer que des commandes « Sur Stock / Besoin interne »",
      }, { status: 403 });
    }
    effectiveStatus = PLANIF_ALLOWED_STATUS;
  }

  const needAgency = effectiveStatus !== "SUR_STOCK";

  // Validation des champs requis (le numéro de commande n'est plus requis du client)
  if (!clientId || (needAgency && !agencyId) || !itemsList || itemsList.length === 0) {
    return NextResponse.json({ 
      error: needAgency ? "Client, agence et articles requis" : "Client et articles requis" 
    }, { status: 400 });
  }

  // Agence : fournie, sinon agence interne pour les commandes « Sur Stock »
  let resolvedAgencyId: number;
  try {
    resolvedAgencyId = agencyId ? parseInt(agencyId) : await resolveInternalAgencyId();
  } catch (error) {
    console.error("Erreur résolution agence:", error);
    return NextResponse.json({ error: "Erreur lors de la résolution de l'agence" }, { status: 500 });
  }
  const createAgencyScope = agencyScopeForUser(a.user);
  if (createAgencyScope && !createAgencyScope.includes(resolvedAgencyId)) {
    return NextResponse.json({ error: "Vous n'avez pas accès à cette agence" }, { status: 403 });
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
    agencyId: resolvedAgencyId,
    affaire: affaire || null, 
    status: effectiveStatus,
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
      isTelegestion: !!item.isTelegestion,
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
  await notifyRoles(["technique"], {
    eventKey: NOTIFICATION_EVENTS.ORDER_CREATED,
    title: `Nouvelle commande #${orderNumber}`,
    message: `Commande ${orderNumber} en attente de traitement technique`,
    orderId: created.id,
    targetTab: "orders",
  });
  await notifyRoles(["planification"], {
    eventKey: NOTIFICATION_EVENTS.ORDER_CREATED,
    title: `Nouvelle commande #${orderNumber}`,
    message: `Commande ${orderNumber} créée par ${a.user.fullName}`,
    orderId: created.id,
    targetTab: "orders",
  });

  return NextResponse.json({ order: created, orderNumber }, { status: 201 });
}
