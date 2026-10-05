import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { photometricStudies, photometricStudyItems, orders, orderItems, itemTechnicalComponents, matieres, materialCategories, clients, driveDocuments } from "@/db/schema";
import { eq, desc, isNull, inArray } from "drizzle-orm";
import { getUserFromHeaders, logActivity, logModification } from "@/lib/auth";
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
    return { id: null as number | null, reference: null as string | null, label: null as string | null, categoryId: null as number | null };
  }
  const lid = parseInt(String(lensId));
  const [lens] = await db.select().from(matieres).where(eq(matieres.id, lid)).limit(1);
  if (!lens) return { error: "Lentille introuvable" } as const;
  const cats = await db.select().from(materialCategories);
  const lensCat = cats.find((c) => c.key === "lens" || c.name.toLowerCase().includes("lentille"));
  if (lensCat && lens.categoryId !== lensCat.id) {
    return { error: "La matière choisie n'est pas une lentille" } as const;
  }
  return { id: lens.id, reference: lens.reference, label: lens.name, categoryId: lens.categoryId };
}

/**
 * Applique la lentille d'une étude liée à une commande sur la spécification
 * existante de l'article. On met à jour la colonne `order_items.lens` : aucune
 * ligne de composant technique ou d'article n'est créée.
 */
async function applyStudyLensToArticle(
  orderId: number,
  orderItemId: number,
  lens: { id: number | null; reference: string | null; label: string | null; categoryId: number | null },
  studyNumber: string,
  user: { id: number; fullName: string },
) {
  const reference = lens.reference?.trim();
  if (!reference || lens.id === null) return;

  const [article] = await db.select().from(orderItems)
    .where(eq(orderItems.id, orderItemId)).limit(1);
  if (!article || article.orderId !== orderId) return;

  const components = await db.select().from(itemTechnicalComponents)
    .where(eq(itemTechnicalComponents.itemId, orderItemId));
  const existingLensComponent = components.find((component) =>
    component.categoryKey === "lens" || (lens.categoryId !== null && component.categoryId === lens.categoryId),
  );
  const componentChanged = !!existingLensComponent && existingLensComponent.materialId !== lens.id;
  const articleChanged = article.lens !== reference;
  if (!componentChanged && !articleChanged) return;

  const appliedAt = new Date().toISOString();
  if (articleChanged) {
    await db.update(orderItems).set({
      lens: reference,
      lensBy: user.fullName,
      lensAt: appliedAt,
    }).where(eq(orderItems.id, orderItemId));
  }

  // Remplacer la valeur de la ligne Lentille existante, sans INSERT. Les
  // métadonnées de saisie conservent la traçabilité de l'application par étude.
  if (existingLensComponent && componentChanged) {
    await db.update(itemTechnicalComponents).set({
      materialId: lens.id,
      materialReference: reference,
      materialLabel: lens.label || reference,
      enteredById: user.id,
      enteredByName: user.fullName,
      enteredAt: appliedAt,
    }).where(eq(itemTechnicalComponents.id, existingLensComponent.id));
  }

  await logModification(
    orderId,
    user.id,
    user.fullName,
    `Lentille ${article.articleName} (étude #${studyNumber})`,
    existingLensComponent?.materialReference || article.lens || "",
    reference,
  );
}

/**
 * GET /api/photometric-studies
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const orderId = sp.get("orderId");
  const rawOrderIds = sp.get("orderIds");
  const standalone = sp.get("standalone");
  const orderIds = rawOrderIds
    ? [...new Set(rawOrderIds.split(",")
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0))]
    : [];

  if (rawOrderIds && orderIds.length === 0) {
    return NextResponse.json({ error: "Au moins une commande est requise" }, { status: 400 });
  }

  let studiesQuery;
  if (orderIds.length > 0) {
    studiesQuery = db.select().from(photometricStudies)
      .where(inArray(photometricStudies.orderId, orderIds))
      .orderBy(desc(photometricStudies.updatedAt), desc(photometricStudies.createdAt));
  } else if (orderId) {
    studiesQuery = db.select().from(photometricStudies)
      .where(eq(photometricStudies.orderId, parseInt(orderId)))
      .orderBy(desc(photometricStudies.updatedAt), desc(photometricStudies.createdAt));
  } else if (standalone === "1") {
    studiesQuery = db.select().from(photometricStudies)
      .where(isNull(photometricStudies.orderId))
      .orderBy(desc(photometricStudies.updatedAt), desc(photometricStudies.createdAt)).limit(500);
  } else {
    studiesQuery = db.select().from(photometricStudies)
      .orderBy(desc(photometricStudies.updatedAt), desc(photometricStudies.createdAt)).limit(500);
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
  // Le dernier document est renvoyé pour permettre le téléchargement direct
  // depuis la ligne d'étude ; la liste complète reste disponible via DocumentsPanel.
  const documentRows = studyIds.length > 0
    ? await db.select({
        studyId: driveDocuments.studyId,
        driveFileId: driveDocuments.driveFileId,
        fileName: driveDocuments.fileName,
        mimeType: driveDocuments.mimeType,
      }).from(driveDocuments)
        .where(inArray(driveDocuments.studyId, studyIds))
        .orderBy(desc(driveDocuments.createdAt))
    : [];
  const docByStudy = new Map<number, {
    totalCount: number;
    latest: { driveFileId: string; fileName: string; mimeType: string | null };
  }>();
  for (const document of documentRows) {
    if (document.studyId === null) continue;
    const current = docByStudy.get(document.studyId);
    if (current) {
      current.totalCount += 1;
    } else {
      docByStudy.set(document.studyId, {
        totalCount: 1,
        latest: {
          driveFileId: document.driveFileId,
          fileName: document.fileName,
          mimeType: document.mimeType,
        },
      });
    }
  }

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
    documentCount: docByStudy.get(s.id)?.totalCount || 0,
    studyDocument: docByStudy.get(s.id)?.latest || null,
  }));

  return NextResponse.json({ studies }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
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
  const prepared: { orderItemId: number | null; productName: string; lens: { id: number | null; reference: string | null; label: string | null; categoryId: number | null }; note: string | null }[] = [];
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

  if (resolvedOrderId !== null) {
    const appliedArticleIds = new Set<number>();
    for (const p of prepared) {
      if (p.orderItemId === null || !p.lens.reference || appliedArticleIds.has(p.orderItemId)) continue;
      appliedArticleIds.add(p.orderItemId);
      await applyStudyLensToArticle(resolvedOrderId, p.orderItemId, p.lens, studyNumber.trim(), user);
    }
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

  const studyId = parseInt(id);
  const [study] = await db.select().from(photometricStudies).where(eq(photometricStudies.id, studyId)).limit(1);
  if (!study) return NextResponse.json({ error: "Étude non trouvée" }, { status: 404 });

  // orderId est facultatif pour une simple modification. Lorsqu'il est
  // fourni, il permet la conversion d'une étude indépendante (orderId NULL)
  // vers une commande existante, ou le rattachement à une autre commande.
  let targetOrderId = study.orderId;
  let targetOrderNumber: string | null = null;
  if (body.orderId !== undefined) {
    const requestedOrderId = body.orderId === null || String(body.orderId).trim() === ""
      ? null
      : parseInt(String(body.orderId));
    if (requestedOrderId === null || !Number.isFinite(requestedOrderId)) {
      return NextResponse.json({ error: "Une commande existante est requise pour le rattachement" }, { status: 400 });
    }
    const [targetOrder] = await db.select().from(orders).where(eq(orders.id, requestedOrderId)).limit(1);
    if (!targetOrder) return NextResponse.json({ error: "Commande cible non trouvée" }, { status: 404 });
    targetOrderId = targetOrder.id;
    targetOrderNumber = targetOrder.orderNumber;
  } else if (targetOrderId !== null) {
    const [targetOrder] = await db.select({ orderNumber: orders.orderNumber }).from(orders)
      .where(eq(orders.id, targetOrderId)).limit(1);
    targetOrderNumber = targetOrder?.orderNumber || null;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (studyNumber !== undefined) updates.studyNumber = studyNumber.trim();
  if (note !== undefined) updates.note = note?.trim() || null;
  if (targetOrderId !== null) {
    updates.orderId = targetOrderId;
    // Une étude liée utilise l'affaire de la commande ; le nom libre ne doit
    // pas rester une seconde source contradictoire après conversion.
    updates.affaireName = null;
  } else if (body.affaireName !== undefined) {
    updates.affaireName = body.affaireName?.trim() || null;
  }
  if (clientId !== undefined) {
    updates.clientId = clientId ? parseInt(clientId) : null;
    if (clientId) {
      const [client] = await db.select().from(clients).where(eq(clients.id, parseInt(clientId))).limit(1);
      updates.clientName = client?.name || null;
    } else {
      updates.clientName = null;
    }
  }

  let prepared: { orderItemId: number | null; productName: string; lens: { id: number | null; reference: string | null; label: string | null; categoryId: number | null }; note: string | null }[] = [];
  if (Array.isArray(items)) {
    // Validation complète avant toute suppression/insertion : une conversion
    // partielle ne doit jamais rattacher une étude avec des articles invalides.
    for (const item of items as StudyItemInput[]) {
      const snap = await resolveLensSnapshot(item.lensId ?? null);
      if ("error" in snap) return NextResponse.json({ error: snap.error }, { status: 422 });
      if (targetOrderId !== null) {
        const v = await resolveOrderItem(targetOrderId, item);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 422 });
        prepared.push({ orderItemId: v.item.id, productName: v.item.articleName, lens: snap, note: item.note?.trim() || null });
      } else {
        if (!item.productName?.trim()) continue;
        prepared.push({ orderItemId: null, productName: item.productName.trim(), lens: snap, note: item.note?.trim() || null });
      }
    }
    if (prepared.length === 0) return NextResponse.json({ error: "Au moins un produit requis" }, { status: 400 });

    await db.delete(photometricStudyItems).where(eq(photometricStudyItems.studyId, studyId));
    for (const p of prepared) {
      await db.insert(photometricStudyItems).values({
        studyId,
        orderItemId: p.orderItemId,
        productName: p.productName,
        lensId: p.lens.id,
        lensReference: p.lens.reference,
        lensLabel: p.lens.label,
        note: p.note,
      });
    }

    if (targetOrderId !== null) {
      const appliedArticleIds = new Set<number>();
      const effectiveStudyNumber = typeof studyNumber === "string" ? studyNumber.trim() : study.studyNumber;
      for (const p of prepared) {
        if (p.orderItemId === null || !p.lens.reference || appliedArticleIds.has(p.orderItemId)) continue;
        appliedArticleIds.add(p.orderItemId);
        await applyStudyLensToArticle(targetOrderId, p.orderItemId, p.lens, effectiveStudyNumber, user);
      }
    }
  }

  await db.update(photometricStudies).set(updates).where(eq(photometricStudies.id, studyId));

  const wasConverted = study.orderId === null && targetOrderId !== null;
  const actionDetails = wasConverted
    ? `Étude #${study.studyNumber} convertie vers la commande ${targetOrderNumber || targetOrderId}`
    : `Étude #${study.studyNumber} modifiée`;
  await logActivity(user.id, user.username, "UPDATE_PHOTOMETRIC_STUDY", actionDetails);
  return NextResponse.json({ ok: true, converted: wasConverted, orderId: targetOrderId });
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
