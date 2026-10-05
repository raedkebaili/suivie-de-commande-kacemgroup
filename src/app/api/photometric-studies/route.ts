import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { photometricStudies, photometricStudyItems, orders, orderItems, matieres, materialCategories, clients, driveDocuments } from "@/db/schema";
import { eq, desc, isNull, inArray, sql } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { articleLensToValue, resolveStudyLens } from "@/lib/study-lens";

export const dynamic = "force-dynamic";

type StudyItemInput = {
  productName: string;
  orderItemId?: string | number | null;
  lensId?: string | number | null;
  note?: string;
};

// ── ÉVOLUTION ÉTUDES §4 : article ∈ articles de la commande ─────────────
// Tolérance historique : si orderItemId est absent mais que productName
// correspond EXACTEMENT (insensible à la casse) à UN article de la commande,
// le serveur relie automatiquement (lignes créées avant l'évolution).
async function resolveOrderItem(orderId: number, input: StudyItemInput) {
  if (input.orderItemId !== undefined && input.orderItemId !== null && String(input.orderItemId) !== "") {
    const iid = parseInt(String(input.orderItemId));
    if (!iid) return { error: "Article invalide" } as const;
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, iid)).limit(1);
    if (!item) return { error: "Article introuvable" } as const;
    if (item.orderId !== orderId) {
      return { error: `L'article « ${item.articleName} » n'appartient pas à la commande sélectionnée` } as const;
    }
    return { item } as const;
  }
  // Ligne historique sans orderItemId : tentative d'appariement par nom exact.
  const name = (input.productName || "").trim().toLowerCase();
  if (!name) return { error: "Chaque produit doit être un article de la commande sélectionnée" } as const;
  const candidates = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const match = candidates.filter((c) => c.articleName.trim().toLowerCase() === name);
  if (match.length === 1) return { item: match[0] } as const;
  return { error: `« ${input.productName} » : sélectionnez un article appartenant à la commande (filtrage strict)` } as const;
}

// ── ÉVOLUTION ÉTUDES : la lentille doit appartenir à la catégorie lentille ──
// Même règle que le frontend (OrdersView lensCategory). Si la catégorie est
// introuvable (configuration incomplète), on accepte toute matière existante
// (fail-open) pour ne jamais bloquer l'enregistrement sur un problème de config.
async function resolveLensSnapshot(lensId: string | number | null | undefined) {
  if (!lensId || !parseInt(String(lensId))) {
    return { id: null as number | null, reference: null as string | null, label: null as string | null };
  }
  const lid = parseInt(String(lensId));
  const [lens] = await db.select().from(matieres).where(eq(matieres.id, lid)).limit(1);
  if (!lens) return { error: "Lentille introuvable" } as const;
  const cats = await db.select().from(materialCategories);
  const lensCat = cats.find((c) => c.key === "lens" || c.name.toLowerCase().includes("lentille"));
  if (lensCat && lens.categoryId !== lensCat.id) {
    return { error: "La matière choisie n'est pas une lentille" } as const;
  }
  return { id: lens.id, reference: lens.reference, label: lens.name };
}

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

  // ── ÉVOLUTION ÉTUDES §21 : résolution backend spec article vs override ──
  // 1 requête groupée (anti N+1), champs ADDITIFS (rétrocompatible).
  const linkedIds = allItems.map((i) => i.orderItemId).filter((x): x is number => x !== null);
  const linkedArticles = linkedIds.length > 0
    ? await db.select().from(orderItems).where(inArray(orderItems.id, linkedIds))
    : [];
  const byArticle = new Map(linkedArticles.map((a) => [a.id, a]));

  // ── Documents associés (ajout rétrocompatible, champs additifs) ──────
  const docStats = studyIds.length > 0
    ? await db.select({
        studyId: driveDocuments.studyId,
        totalCount: sql<number>`count(*)::int`,
      }).from(driveDocuments)
        .where(inArray(driveDocuments.studyId, studyIds))
        .groupBy(driveDocuments.studyId)
    : [];
  const docByStudy = new Map(docStats.map(d => [d.studyId, d]));

  const studies = studyRows.map(s => ({
    ...s,
    items: allItems.filter(i => i.studyId === s.id).map((i) => {
      const article = i.orderItemId !== null ? byArticle.get(i.orderItemId) : undefined;
      const resolved = resolveStudyLens(
        articleLensToValue(article?.lens),
        i.lensReference || i.lensLabel ? { reference: i.lensReference || "", label: i.lensLabel || "" } : null
      );
      return {
        ...i,
        articleReference: article?.reference || null,
        articleLens: article?.lens || null,
        effectiveLens: resolved.effective,
        lensSource: resolved.source,
        overridden: resolved.overridden,
      };
    }),
    documentCount: Number(docByStudy.get(s.id)?.totalCount || 0),
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
  const studyItems: StudyItemInput[] = Array.isArray(items) ? items : [];
  if (studyItems.length === 0) {
    return NextResponse.json({ error: "Au moins un produit requis" }, { status: 400 });
  }

  let orderNumber: string | null = null;
  let resolvedOrderId: number | null = null;
  if (orderId) {
    const [order] = await db.select().from(orders).where(eq(orders.id, parseInt(orderId))).limit(1);
    if (!order) return NextResponse.json({ error: "Commande non trouvée" }, { status: 404 });
    orderNumber = order.orderNumber;
    resolvedOrderId = order.id;
  }

  // ── Validation de chaque ligne AVANT toute insertion (tout-ou-rien) ──
  const prepared: { orderItemId: number | null; productName: string; lens: { id: number | null; reference: string | null; label: string | null }; note: string | null }[] = [];
  for (const item of studyItems) {
    const snap = await resolveLensSnapshot(item.lensId ?? null);
    if ("error" in snap) return NextResponse.json({ error: snap.error }, { status: 422 });
    if (resolvedOrderId !== null) {
      const v = await resolveOrderItem(resolvedOrderId, item);
      if ("error" in v) return NextResponse.json({ error: v.error }, { status: 422 });
      // Le SERVEUR fait foi pour le nom (snapshot) : anti-manipulation client.
      prepared.push({ orderItemId: v.item.id, productName: v.item.articleName, lens: snap, note: item.note?.trim() || null });
    } else {
      if (!item.productName?.trim()) return NextResponse.json({ error: "Nom de produit requis (étude indépendante)" }, { status: 400 });
      prepared.push({ orderItemId: null, productName: item.productName.trim(), lens: snap, note: item.note?.trim() || null });
    }
  }
  if (prepared.length === 0) {
    return NextResponse.json({ error: "Au moins un produit requis" }, { status: 400 });
  }

  // Résoudre le nom du client
  let resolvedClientName: string | null = null;
  if (clientId) {
    const [client] = await db.select().from(clients).where(eq(clients.id, parseInt(clientId))).limit(1);
    if (client) resolvedClientName = client.name;
  }

  const [created] = await db.insert(photometricStudies).values({
    orderId: resolvedOrderId,
    clientId: clientId ? parseInt(clientId) : null,
    clientName: resolvedClientName,
    affaireName: orderId ? null : affaireName?.trim() || null,
    studyNumber: studyNumber.trim(),
    note: note?.trim() || null,
    createdById: user.id,
    createdByName: user.fullName,
  }).returning();

  for (const p of prepared) {
    await db.insert(photometricStudyItems).values({
      studyId: created.id,
      orderItemId: p.orderItemId,
      productName: p.productName,
      lensId: p.lens.id,
      lensReference: p.lens.reference,
      lensLabel: p.lens.label,
      note: p.note,
    });
  }

  const context = orderId ? `commande ${orderNumber}` : `affaire "${affaireName?.trim()}"`;
  await logActivity(user.id, user.username, "CREATE_PHOTOMETRIC_STUDY",
    `Étude #${studyNumber} pour ${context} — ${prepared.length} produit(s)`);

  return NextResponse.json({ study: { ...created, items: prepared } }, { status: 201 });
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
    // §18-§19 : l'override est conservé car le formulaire renvoie le lensId
    // existant ; lensId=null explicite = suppression volontaire de l'override
    // (retour au défaut article). La fiche article n'est jamais écrite ici.
    const prepared: { orderItemId: number | null; productName: string; lens: { id: number | null; reference: string | null; label: string | null }; note: string | null }[] = [];
    for (const item of items as StudyItemInput[]) {
      const snap = await resolveLensSnapshot(item.lensId ?? null);
      if ("error" in snap) return NextResponse.json({ error: snap.error }, { status: 422 });
      if (study.orderId !== null) {
        const v = await resolveOrderItem(study.orderId, item);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 422 });
        prepared.push({ orderItemId: v.item.id, productName: v.item.articleName, lens: snap, note: item.note?.trim() || null });
      } else {
        if (!item.productName?.trim()) continue;
        prepared.push({ orderItemId: null, productName: item.productName.trim(), lens: snap, note: item.note?.trim() || null });
      }
    }
    await db.delete(photometricStudyItems).where(eq(photometricStudyItems.studyId, parseInt(id)));
    for (const p of prepared) {
      await db.insert(photometricStudyItems).values({
        studyId: parseInt(id),
        orderItemId: p.orderItemId,
        productName: p.productName,
        lensId: p.lens.id,
        lensReference: p.lens.reference,
        lensLabel: p.lens.label,
        note: p.note,
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
