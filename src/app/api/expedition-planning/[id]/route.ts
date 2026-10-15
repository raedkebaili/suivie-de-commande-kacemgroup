export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { expeditionBatches, expeditionPlanEntries, orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

const MANAGER_ROLES = ["superadmin", "planification"];
type ExpeditionPlanStatus = "NON_TRAITE" | "EN_COURS" | "LIVRE" | "ANNULE";

function normalizeStatus(status: string): ExpeditionPlanStatus {
  if (status === "PLANIFIE") return "NON_TRAITE";
  if (status === "TERMINE") return "LIVRE";
  if (["EN_COURS", "LIVRE", "ANNULE"].includes(status)) return status as ExpeditionPlanStatus;
  return "NON_TRAITE";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!MANAGER_ROLES.includes(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [entry] = await db.select().from(expeditionPlanEntries).where(eq(expeditionPlanEntries.id, id)).limit(1);
    if (!entry) return NextResponse.json({ error: "Planning d'expédition introuvable" }, { status: 404 });

    const currentStatus = normalizeStatus(entry.status);
    const body = await request.json();
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedByName: user.fullName,
    };
    let changed = false;

    if (entry.loadedQty > 0 || currentStatus === "LIVRE") {
      const requestedStatus = body.status === undefined ? currentStatus : normalizeStatus(String(body.status));
      if (requestedStatus !== "LIVRE") {
        return NextResponse.json({ error: "Une ligne livrée ne peut plus être réouverte" }, { status: 400 });
      }
    }

    if (body.planDate !== undefined) {
      const planDate = String(body.planDate);
      if (!validDate(planDate)) return NextResponse.json({ error: "Date de chargement invalide" }, { status: 400 });
      if (planDate !== entry.planDate) changed = true;
      updates.planDate = planDate;
    }
    if (body.driverName !== undefined) {
      const driverName = String(body.driverName || "").trim();
      if (!driverName) return NextResponse.json({ error: "Le chauffeur/porteur est requis" }, { status: 400 });
      if (driverName !== entry.driverName) changed = true;
      updates.driverName = driverName;
    }
    if (body.plannedQty !== undefined) {
      const plannedQty = Number.parseInt(String(body.plannedQty), 10);
      if (!Number.isInteger(plannedQty) || plannedQty <= 0) return NextResponse.json({ error: "Quantité à livrer invalide" }, { status: 400 });
      if (entry.loadedQty > 0 || currentStatus === "LIVRE") return NextResponse.json({ error: "La quantité d'une ligne livrée ne peut plus être modifiée" }, { status: 400 });
      const [item] = await db.select({ producedQty: orderItems.producedQty, deliveredQty: orderItems.deliveredQty })
        .from(orderItems).where(eq(orderItems.id, entry.itemId)).limit(1);
      const available = Math.max(0, (item?.producedQty || 0) - (item?.deliveredQty || 0));
      if (plannedQty > available) return NextResponse.json({ error: `Quantité maximale à livrer : ${available}` }, { status: 400 });
      if (plannedQty !== entry.plannedQty) changed = true;
      updates.plannedQty = plannedQty;
    }
    if (body.note !== undefined) {
      const note = String(body.note || "").trim() || null;
      if (note !== entry.note) changed = true;
      updates.note = note;
    }

    const requestedStatus = body.status === undefined ? currentStatus : normalizeStatus(String(body.status));
    if (body.status !== undefined && requestedStatus !== currentStatus) changed = true;

    // Le cumul réel n'est écrit qu'à la transition vers LIVRE. Les articles
    // et la ligne de planning sont verrouillés dans la même transaction afin
    // que deux validations simultanées ne créent jamais deux lots.
    if (requestedStatus === "LIVRE" && currentStatus !== "LIVRE") {
      const deliveryDate = new Date().toISOString().split("T")[0];
      const result = await db.transaction(async (tx) => {
        const [lockedEntry] = await tx.select().from(expeditionPlanEntries)
          .where(eq(expeditionPlanEntries.id, id)).for("update").limit(1);
        if (!lockedEntry) return { error: "Planning d'expédition introuvable" as const };
        if (normalizeStatus(lockedEntry.status) === "LIVRE") {
          return { alreadyDelivered: true as const };
        }
        const [item] = await tx.select().from(orderItems)
          .where(eq(orderItems.id, lockedEntry.itemId)).for("update").limit(1);
        if (!item) return { error: "Article introuvable" as const };
        const available = Math.max(0, (item.producedQty || 0) - (item.deliveredQty || 0));
        const plannedQty = typeof updates.plannedQty === "number" ? updates.plannedQty : lockedEntry.plannedQty;
        const qtyToApply = plannedQty - lockedEntry.loadedQty;
        if (qtyToApply < 0) return { error: "La quantité déjà livrée dépasse la quantité planifiée" as const };
        if (qtyToApply > available) return { error: `Quantité produite disponible à livrer : ${available}` as const };
        if (plannedQty <= 0) return { error: "La quantité à livrer doit être supérieure à zéro" as const };
        const cumulativeTotal = (item.deliveredQty || 0) + qtyToApply;
        if (qtyToApply > 0) {
          await tx.insert(expeditionBatches).values({
            itemId: item.id,
            orderId: item.orderId,
            quantity: qtyToApply,
            cumulativeTotal,
            driverName: typeof updates.driverName === "string" ? updates.driverName : lockedEntry.driverName,
            plannedLoadingDate: typeof updates.planDate === "string" ? updates.planDate : lockedEntry.planDate,
            deliveredBy: user.fullName,
            deliveryDate,
            note: typeof updates.note === "string" ? updates.note : lockedEntry.note,
          });
          await tx.update(orderItems).set({ deliveredQty: cumulativeTotal, deliveryDate }).where(eq(orderItems.id, item.id));
        }
        await tx.update(expeditionPlanEntries).set({
          ...updates,
          plannedQty,
          loadedQty: plannedQty,
          status: "LIVRE",
        }).where(eq(expeditionPlanEntries.id, id));
        return { applied: true as const };
      });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error === "Article introuvable" ? 404 : 400 });
      if ("alreadyDelivered" in result) return NextResponse.json({ error: "Cette ligne a déjà été livrée" }, { status: 409 });
    } else {
      updates.status = requestedStatus;
      await db.update(expeditionPlanEntries).set(updates).where(eq(expeditionPlanEntries.id, id));
    }

    if (changed || requestedStatus === "LIVRE") {
      await logActivity(user.id, user.username, "EXPEDITION_PLANNING_UPDATE",
        `${entry.articleName} — planning du ${entry.planDate} → ${requestedStatus}`);
    }
    const [updated] = await db.select().from(expeditionPlanEntries).where(eq(expeditionPlanEntries.id, id)).limit(1);
    return NextResponse.json({ plan: updated ? { ...updated, status: normalizeStatus(updated.status) } : null });
  } catch (error) {
    console.error("Erreur modification planning expédition:", error);
    return NextResponse.json({ error: "Erreur lors de la modification du planning d'expédition" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!MANAGER_ROLES.includes(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  const [entry] = await db.select().from(expeditionPlanEntries).where(eq(expeditionPlanEntries.id, id)).limit(1);
  if (!entry) return NextResponse.json({ error: "Planning d'expédition introuvable" }, { status: 404 });
  if (entry.loadedQty > 0 || normalizeStatus(entry.status) === "LIVRE") return NextResponse.json({ error: "Impossible de retirer une ligne déjà livrée" }, { status: 400 });

  await db.delete(expeditionPlanEntries).where(eq(expeditionPlanEntries.id, id));
  await logActivity(user.id, user.username, "EXPEDITION_PLANNING_DELETE",
    `${entry.articleName} — planning du ${entry.planDate} supprimé`);
  return NextResponse.json({ ok: true });
}
