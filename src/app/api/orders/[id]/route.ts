export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, productionBatches, expeditionBatches, modificationLogs, notifications, itemTechnicalComponents, matieres, materialCategories } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { logActivity, logModification, getUserFromHeaders, notifyUser } from "@/lib/auth";

async function auth(r: Request, roles?: string[]) {
  const u = await getUserFromHeaders(r);
  if (!u) return { ok: false as const, status: 401, error: "Non authentifié" };
  if (roles && !roles.includes(u.role)) return { ok: false as const, status: 403, error: "Accès refusé" };
  return { ok: true as const, user: u };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth(request); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { id } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.id, parseInt(id))).limit(1);
  if (!order) return NextResponse.json({ error: "Non trouvée" }, { status: 404 });
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const components = await db.select().from(itemTechnicalComponents).where(eq(itemTechnicalComponents.orderId, order.id));
  return NextResponse.json({
    order: {
      ...order,
      items: items.map(item => ({ ...item, technicalComponents: components.filter(component => component.itemId === item.id) })),
    },
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth(request); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { id } = await params; const oid = parseInt(id);
  const [existing] = await db.select().from(orders).where(eq(orders.id, oid)).limit(1);
  if (!existing) return NextResponse.json({ error: "Non trouvée" }, { status: 404 });

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  const now = new Date().toISOString();

  if (existing.lockedBy && existing.lockedBy !== a.user.id && existing.lockedAt && (Date.now() - new Date(existing.lockedAt).getTime() < 5 * 60 * 1000))
    return NextResponse.json({ error: `Verrouillé par ${existing.lockedByName}` }, { status: 423 });
  updates.lockedBy = a.user.id; updates.lockedByName = a.user.fullName; updates.lockedAt = now;

  // ── COMMERCIAL: add/remove items, update order info ──
  if (["superadmin", "commercial"].includes(a.user.role)) {
    updates.updatedBy = a.user.fullName; // only commercial modifications are traced
    const log = (field: string, oldVal: unknown, newVal: unknown) => {
      if (String(oldVal||"") !== String(newVal||"")) {
        logModification(oid, a.user.id, a.user.fullName, field, String(oldVal||""), String(newVal||""));
      }
    };
    if (body.orderNumber !== undefined) { log("N° Commande", existing.orderNumber, body.orderNumber); updates.orderNumber = body.orderNumber; }
    if (body.orderDate !== undefined) { log("Date", existing.orderDate, body.orderDate); updates.orderDate = body.orderDate; }
    if (body.clientId !== undefined) { const v=parseInt(body.clientId); log("Client", existing.clientId, v); updates.clientId = v; }
    if (body.agencyId !== undefined) { const v=parseInt(body.agencyId); log("Agence", existing.agencyId, v); updates.agencyId = v; }
    if (body.affaire !== undefined) { log("Affaire", existing.affaire, body.affaire); updates.affaire = body.affaire; }
    if (body.status !== undefined) {
      const allowedCommercialStatuses = ["SUR_STOCK", "BON_COMMANDE", "PREVISION"];
      if (allowedCommercialStatuses.includes(body.status)) {
        log("État commercial", existing.status, body.status);
        updates.status = body.status;
      }
    }

    // Handle items: remove deleted ones, add new ones, update existing
    if (body.items && Array.isArray(body.items)) {
      const existingItems = await db.select().from(orderItems).where(eq(orderItems.orderId, oid));
      const sentIds = new Set(body.items.filter((i: OrderItemLike) => i.id).map((i: OrderItemLike) => i.id));
      // Delete items that were removed (only if no production/expedition logs exist)
      for (const ex of existingItems) {
        if (!sentIds.has(ex.id)) {
          // Check if item has production/expedition logs
          const [hasProdRow] = await db.select({ c: count() }).from(productionBatches).where(eq(productionBatches.itemId, ex.id));
          const [hasExpRow] = await db.select({ c: count() }).from(expeditionBatches).where(eq(expeditionBatches.itemId, ex.id));
          const hasProd = { c: hasProdRow?.c || 0 };
          const hasExp = { c: hasExpRow?.c || 0 };
          if (hasProd.c === 0 && hasExp.c === 0) {
            await db.delete(orderItems).where(eq(orderItems.id, ex.id));
            logModification(oid, a.user.id, a.user.fullName, "Article supprimé", ex.articleName, null);
          }
        }
      }
      // Add new items / update existing
      for (const item of body.items) {
        if (!item.articleName?.trim()) continue;
        if (item.id) {
          // Update existing item (commercial can edit note)
          const [oldItem] = await db.select().from(orderItems).where(eq(orderItems.id, item.id)).limit(1);
          if (oldItem) {
            if (oldItem.articleName !== item.articleName) logModification(oid, a.user.id, a.user.fullName, `Article renommé`, oldItem.articleName, item.articleName);
            if (oldItem.quantity !== (item.quantity||1)) logModification(oid, a.user.id, a.user.fullName, `Qté ${item.articleName}`, String(oldItem.quantity), String(item.quantity||1));
            if ((oldItem.note||"") !== (item.note||"")) logModification(oid, a.user.id, a.user.fullName, `Note ${item.articleName}`, oldItem.note||"", item.note||"");
            if ((oldItem.clientSpec||"") !== (item.clientSpec||"")) logModification(oid, a.user.id, a.user.fullName, `Besoin ${item.articleName}`, oldItem.clientSpec||"", item.clientSpec||"");
          }
          await db.update(orderItems).set({
            articleName: item.articleName, quantity: item.quantity || 1,
            note: item.note || null,
            clientSpec: item.clientSpec || null,
            productionUnit: item.productionUnit || null,
            plannedLoadingDate: item.plannedLoadingDate || null,
            unitPrice: item.unitPrice || null, description: item.description || null,
          }).where(eq(orderItems.id, item.id));
        } else {
          // Add new item
          logModification(oid, a.user.id, a.user.fullName, "Article ajouté", null, item.articleName);
          await db.insert(orderItems).values({
            orderId: oid, articleName: item.articleName, quantity: item.quantity || 1,
            note: item.note || null,
            clientSpec: item.clientSpec || null,
            productionUnit: item.productionUnit || null,
            plannedLoadingDate: item.plannedLoadingDate || null,
            unitPrice: item.unitPrice || null, description: item.description || null,
            deliveredQty: 0, producedQty: 0,
          });
        }
      }
    }
  }

  // ── TECHNIQUE: per-item tech specs (each field keeps its own trace) ──
  if (["superadmin", "technique"].includes(a.user.role) && body.techItems && Array.isArray(body.techItems)) {
    for (const ti of body.techItems) {
      if (!ti.itemId) continue;
      // Fetch current values to compare
      const [current] = await db.select().from(orderItems).where(eq(orderItems.id, parseInt(ti.itemId))).limit(1);
      if (!current) continue;
      const iu: Record<string, unknown> = {};
      // Only update _by/_at if the value actually changed
      const setIfChanged = (field: string, byField: string, atField: string, newVal: string | undefined) => {
        if (newVal === undefined) return;
        const oldVal = (current as Record<string, unknown>)[field];
        const normalizedNew = newVal.trim() || null;
        if (normalizedNew !== (oldVal || null)) {
          iu[field] = normalizedNew;
          if (normalizedNew) { iu[byField] = a.user.fullName; iu[atField] = now; }
        }
      };
      setIfChanged("pcb", "pcbBy", "pcbAt", ti.pcb);
      setIfChanged("colorTemperature", "colorTempBy", "colorTempAt", ti.colorTemperature);
      setIfChanged("lens", "lensBy", "lensAt", ti.lens);
      setIfChanged("driver", "driverBy", "driverAt", ti.driver);
      setIfChanged("electricalClass", "elecClassBy", "elecClassAt", ti.electricalClass);
      setIfChanged("accessories", "accessoriesBy", "accessoriesAt", ti.accessories);
      setIfChanged("otherTechSpecs", "otsBy", "otsAt", ti.otherTechSpecs);
      if (Object.keys(iu).length > 0) await db.update(orderItems).set(iu).where(eq(orderItems.id, parseInt(ti.itemId)));
    }
    updates.techCompleted = true;
    if (existing.createdBy) await notifyUser(existing.createdBy, "success", `Tech OK #${existing.orderNumber}`, `Spécs techniques mises à jour`, oid);
  }

  // ── TECHNIQUE DYNAMIQUE: composants sélectionnés depuis la table Matières ──
  // CORRECTION BUG TRAÇABILITÉ : Mise à jour DIFFÉRENTIELLE pour préserver la traçabilité
  // Chaque composant conserve son propre créateur (enteredById, enteredByName, enteredAt)
  // Seuls les composants réellement modifiés sont affectés
  if (["superadmin", "technique"].includes(a.user.role) && body.dynamicTechItems && Array.isArray(body.dynamicTechItems)) {
    await db.transaction(async tx => {
      for (const selection of body.dynamicTechItems as { itemId: number; materialIds: number[] }[]) {
        const itemId = parseInt(String(selection.itemId));
        const [ownedItem] = await tx.select().from(orderItems).where(eq(orderItems.id, itemId)).limit(1);
        if (!ownedItem || ownedItem.orderId !== oid) continue;

        // Récupérer les composants existants pour cet article
        const existingComponents = await tx.select().from(itemTechnicalComponents).where(eq(itemTechnicalComponents.itemId, itemId));
        const existingMaterialIds = new Set(existingComponents.map(c => c.materialId).filter((id): id is number => id !== null));
        
        // Normaliser les nouveaux materialIds
        const newMaterialIds = new Set(
          (selection.materialIds || [])
            .map(value => parseInt(String(value)))
            .filter(Number.isFinite)
        );

        // COMPARAISON DIFFÉRENTIELLE : ne rien faire si identique
        const existingArray = [...existingMaterialIds].sort((a, b) => a - b);
        const newArray = [...newMaterialIds].sort((a, b) => a - b);
        const isIdentical = existingArray.length === newArray.length && 
                           existingArray.every((id, idx) => id === newArray[idx]);
        
        if (isIdentical) {
          // Aucun changement pour cet article - PRÉSERVER LA TRAÇABILITÉ EXISTANTE
          continue;
        }

        // Identifier les composants à SUPPRIMER (présents avant, absents maintenant)
        const toRemove = existingComponents.filter(c => c.materialId !== null && !newMaterialIds.has(c.materialId));
        
        // Identifier les composants à AJOUTER (absents avant, présents maintenant)
        const toAdd = [...newMaterialIds].filter(materialId => !existingMaterialIds.has(materialId));

        // SUPPRIMER uniquement les composants retirés
        for (const component of toRemove) {
          await tx.delete(itemTechnicalComponents).where(eq(itemTechnicalComponents.id, component.id));
          
          // Logger chaque suppression individuellement (traçabilité complète)
          await tx.insert(modificationLogs).values({
            orderId: oid,
            userId: a.user.id,
            username: a.user.fullName,
            field: `Composant supprimé - ${ownedItem.articleName}`,
            oldValue: `${component.categoryName}: ${component.materialReference} (${component.materialLabel}) - Créé par ${component.enteredByName}`,
            newValue: null,
          });
        }

        // AJOUTER uniquement les nouveaux composants
        for (const materialId of toAdd) {
          const [material] = await tx.select().from(matieres).where(eq(matieres.id, materialId)).limit(1);
          if (!material || !material.active || !material.categoryId) continue;
          const [category] = await tx.select().from(materialCategories).where(eq(materialCategories.id, material.categoryId)).limit(1);
          if (!category || !category.active) continue;
          
          await tx.insert(itemTechnicalComponents).values({
            itemId,
            orderId: oid,
            categoryId: category.id,
            materialId: material.id,
            categoryKey: category.key,
            categoryName: category.name,
            materialReference: material.reference,
            materialLabel: material.name,
            isTelegestion: category.isTelegestion,
            enteredById: a.user.id,
            enteredByName: a.user.fullName,
            enteredAt: now,
          });

          // Logger chaque ajout individuellement (traçabilité complète)
          await tx.insert(modificationLogs).values({
            orderId: oid,
            userId: a.user.id,
            username: a.user.fullName,
            field: `Composant ajouté - ${ownedItem.articleName}`,
            oldValue: null,
            newValue: `${category.name}: ${material.reference} (${material.name}) - Ajouté par ${a.user.fullName}`,
          });
        }

        // Les composants INCHANGÉS conservent leur traçabilité originale (aucune action nécessaire)
        // Leur enteredById, enteredByName, enteredAt restent intacts dans la base de données
      }
    });
    updates.techCompleted = true;
    if (existing.createdBy) await notifyUser(existing.createdBy, "success", `Tech OK #${existing.orderNumber}`, `Composants techniques mis à jour par ${a.user.fullName}`, oid);
  }

  // ── PLANIFICATION: priority + productionStatus (independent from commercial status) ──
  if (["superadmin", "planification"].includes(a.user.role)) {
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.productionStatus !== undefined) {
      updates.productionStatus = body.productionStatus;
      updates.statusReason = body.statusReason || null;
      if (body.productionStatus === "ANNULEE") { updates.cancelReason = body.cancelReason || null; updates.cancelledBy = a.user.fullName; updates.cancelledAt = now; }
    }
    if (body.itemUpdates && Array.isArray(body.itemUpdates)) {
      for (const iu of body.itemUpdates) {
        if (!iu.itemId) continue;
        const set: Record<string, unknown> = {};
        if (iu.productionUnit !== undefined) set.productionUnit = iu.productionUnit || null;
        if (iu.plannedLoadingDate !== undefined) set.plannedLoadingDate = iu.plannedLoadingDate || null;
        if (Object.keys(set).length > 0) await db.update(orderItems).set(set).where(eq(orderItems.id, parseInt(iu.itemId)));
      }
    }
    updates.planifCompleted = true;
    if (existing.createdBy) await notifyUser(existing.createdBy, "success", `Planif OK #${existing.orderNumber}`, `${a.user.fullName} a planifié`, oid);
  }

  updates.lockedBy = null; updates.lockedByName = null; updates.lockedAt = null;
  const [updated] = await db.update(orders).set(updates).where(eq(orders.id, oid)).returning();
  await logActivity(a.user.id, a.user.username, "UPDATE_ORDER", `Commande: ${existing.orderNumber}`);
  return NextResponse.json({ order: updated });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth(request, ["superadmin"]); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { id } = await params;
  const oid = parseInt(id);
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, oid)).limit(1);
    if (!order) return NextResponse.json({ error: "Commande non trouvée" }, { status: 404 });

    // Delete all dependent rows first to satisfy foreign key constraints
    await db.delete(productionBatches).where(eq(productionBatches.orderId, oid));
    await db.delete(expeditionBatches).where(eq(expeditionBatches.orderId, oid));
    await db.delete(modificationLogs).where(eq(modificationLogs.orderId, oid));
    await db.delete(notifications).where(eq(notifications.orderId, oid));
    await db.delete(orderItems).where(eq(orderItems.orderId, oid));
    await db.delete(orders).where(eq(orders.id, oid));

    await logActivity(a.user.id, a.user.username, "DELETE_ORDER", `Commande: ${order.orderNumber}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete order error:", err);
    return NextResponse.json({ error: "Erreur lors de la suppression: " + String(err) }, { status: 500 });
  }
}

type OrderItemLike = { id?: number; articleName?: string; quantity?: number; [key: string]: unknown };
