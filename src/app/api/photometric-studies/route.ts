import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { photometricStudies, photometricStudyItems, orders, matieres, clients } from "@/db/schema";
import { eq, desc, isNull, inArray } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

export const dynamic = "force-dynamic";

type StudyItemInput = {
  productName: string;
  lensId?: string | number | null;
  note?: string;
};

/**
 * GET /api/photometric-studies
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const orderId = sp.get("orderId");
  const standalone = sp.get("standalone");

  let studiesQuery;
  if (orderId) {
    studiesQuery = db.select().from(photometricStudies)
      .where(eq(photometricStudies.orderId, parseInt(orderId)))
      .orderBy(desc(photometricStudies.createdAt));
  } else if (standalone === "1") {
    studiesQuery = db.select().from(photometricStudies)
      .where(isNull(photometricStudies.orderId))
      .orderBy(desc(photometricStudies.createdAt)).limit(500);
  } else {
    studiesQuery = db.select().from(photometricStudies)
      .orderBy(desc(photometricStudies.createdAt)).limit(500);
  }

  const studyRows = await studiesQuery;
  const studyIds = studyRows.map(s => s.id);

  let allItems: (typeof photometricStudyItems.$inferSelect)[] = [];
  if (studyIds.length > 0) {
    allItems = await db.select().from(photometricStudyItems)
      .where(inArray(photometricStudyItems.studyId, studyIds));
  }

  const studies = studyRows.map(s => ({
    ...s,
    items: allItems.filter(i => i.studyId === s.id),
  }));

  return NextResponse.json({ studies });
}

/**
 * POST /api/photometric-studies
 * Body : { orderId?, clientId?, affaireName?, studyNumber, note?, items: [...] }
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "technique"].includes(user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await request.json();
  const { orderId, clientId, affaireName, studyNumber, note, items } = body;

  if (!orderId && !affaireName?.trim()) {
    return NextResponse.json({ error: "Sélectionnez une commande ou saisissez un nom d'affaire" }, { status: 400 });
  }
  if (!studyNumber?.trim()) {
    return NextResponse.json({ error: "N° d'étude requis" }, { status: 400 });
  }
  const studyItems: StudyItemInput[] = Array.isArray(items) ? items.filter((i: StudyItemInput) => i.productName?.trim()) : [];
  if (studyItems.length === 0) {
    return NextResponse.json({ error: "Au moins un produit requis" }, { status: 400 });
  }

  let orderNumber: string | null = null;
  if (orderId) {
    const [order] = await db.select().from(orders).where(eq(orders.id, parseInt(orderId))).limit(1);
    if (!order) return NextResponse.json({ error: "Commande non trouvée" }, { status: 404 });
    orderNumber = order.orderNumber;
  }

  // Résoudre le nom du client
  let resolvedClientName: string | null = null;
  if (clientId) {
    const [client] = await db.select().from(clients).where(eq(clients.id, parseInt(clientId))).limit(1);
    if (client) resolvedClientName = client.name;
  }

  const [created] = await db.insert(photometricStudies).values({
    orderId: orderId ? parseInt(orderId) : null,
    clientId: clientId ? parseInt(clientId) : null,
    clientName: resolvedClientName,
    affaireName: orderId ? null : affaireName?.trim() || null,
    studyNumber: studyNumber.trim(),
    note: note?.trim() || null,
    createdById: user.id,
    createdByName: user.fullName,
  }).returning();

  for (const item of studyItems) {
    let lensRef: string | null = null;
    let lensLbl: string | null = null;
    if (item.lensId) {
      const lid = parseInt(String(item.lensId));
      if (lid) {
        const [lens] = await db.select().from(matieres).where(eq(matieres.id, lid)).limit(1);
        if (lens) { lensRef = lens.reference; lensLbl = lens.name; }
      }
    }
    await db.insert(photometricStudyItems).values({
      studyId: created.id,
      productName: item.productName.trim(),
      lensId: item.lensId ? parseInt(String(item.lensId)) : null,
      lensReference: lensRef,
      lensLabel: lensLbl,
      note: item.note?.trim() || null,
    });
  }

  const context = orderId ? `commande ${orderNumber}` : `affaire "${affaireName?.trim()}"`;
  await logActivity(user.id, user.username, "CREATE_PHOTOMETRIC_STUDY",
    `Étude #${studyNumber} pour ${context} — ${studyItems.length} produit(s)`);

  return NextResponse.json({ study: { ...created, items: studyItems } }, { status: 201 });
}

/**
 * PUT /api/photometric-studies
 */
export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "technique"].includes(user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await request.json();
  const { id, studyNumber, note, clientId, items } = body;
  if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

  const [study] = await db.select().from(photometricStudies).where(eq(photometricStudies.id, parseInt(id))).limit(1);
  if (!study) return NextResponse.json({ error: "Étude non trouvée" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (studyNumber !== undefined) updates.studyNumber = studyNumber.trim();
  if (note !== undefined) updates.note = note?.trim() || null;
  if (body.affaireName !== undefined) updates.affaireName = body.affaireName?.trim() || null;
  if (clientId !== undefined) {
    updates.clientId = clientId ? parseInt(clientId) : null;
    if (clientId) {
      const [client] = await db.select().from(clients).where(eq(clients.id, parseInt(clientId))).limit(1);
      updates.clientName = client?.name || null;
    } else {
      updates.clientName = null;
    }
  }

  await db.update(photometricStudies).set(updates).where(eq(photometricStudies.id, parseInt(id)));

  if (Array.isArray(items)) {
    await db.delete(photometricStudyItems).where(eq(photometricStudyItems.studyId, parseInt(id)));
    for (const item of items) {
      if (!item.productName?.trim()) continue;
      let lensRef: string | null = null;
      let lensLbl: string | null = null;
      if (item.lensId) {
        const lid = parseInt(String(item.lensId));
        if (lid) {
          const [lens] = await db.select().from(matieres).where(eq(matieres.id, lid)).limit(1);
          if (lens) { lensRef = lens.reference; lensLbl = lens.name; }
        }
      }
      await db.insert(photometricStudyItems).values({
        studyId: parseInt(id),
        productName: item.productName.trim(),
        lensId: item.lensId ? parseInt(String(item.lensId)) : null,
        lensReference: lensRef,
        lensLabel: lensLbl,
        note: item.note?.trim() || null,
      });
    }
  }

  await logActivity(user.id, user.username, "UPDATE_PHOTOMETRIC_STUDY", `Étude #${study.studyNumber} modifiée`);
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/photometric-studies
 */
export async function DELETE(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Seul l'administrateur peut supprimer une étude" }, { status: 403 });
  }

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

  const [study] = await db.select().from(photometricStudies).where(eq(photometricStudies.id, parseInt(id))).limit(1);
  if (!study) return NextResponse.json({ error: "Étude non trouvée" }, { status: 404 });

  await db.delete(photometricStudies).where(eq(photometricStudies.id, parseInt(id)));
  await logActivity(user.id, user.username, "DELETE_PHOTOMETRIC_STUDY", `Étude #${study.studyNumber} supprimée`);
  return NextResponse.json({ ok: true });
}
