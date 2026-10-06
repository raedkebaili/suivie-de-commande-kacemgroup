export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { expeditionPlanEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

const MANAGER_ROLES = ["superadmin", "planification"];

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

    const body = await request.json();
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedByName: user.fullName,
    };
    let changed = false;

    if (body.planDate !== undefined) {
      const planDate = String(body.planDate);
      if (!validDate(planDate)) return NextResponse.json({ error: "Date de planning invalide" }, { status: 400 });
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
      if (!Number.isInteger(plannedQty) || plannedQty <= 0) return NextResponse.json({ error: "Quantité invalide" }, { status: 400 });
      if (plannedQty < entry.loadedQty) return NextResponse.json({ error: "La quantité ne peut pas être inférieure à la quantité déjà expédiée" }, { status: 400 });
      if (plannedQty !== entry.plannedQty) changed = true;
      updates.plannedQty = plannedQty;
    }
    if (body.note !== undefined) {
      const note = String(body.note || "").trim() || null;
      if (note !== entry.note) changed = true;
      updates.note = note;
    }
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!["PLANIFIE", "EN_COURS", "TERMINE", "ANNULE"].includes(status)) {
        return NextResponse.json({ error: "Statut de planning invalide" }, { status: 400 });
      }
      const effectiveLoaded = entry.loadedQty;
      const effectivePlanned = typeof updates.plannedQty === "number" ? updates.plannedQty : entry.plannedQty;
      if (status === "TERMINE" && effectiveLoaded < effectivePlanned) {
        return NextResponse.json({ error: "Le planning ne peut être terminé avant l'expédition de la quantité prévue" }, { status: 400 });
      }
      if (status !== entry.status) changed = true;
      updates.status = status;
    }

    const [updated] = await db.update(expeditionPlanEntries)
      .set(updates)
      .where(eq(expeditionPlanEntries.id, id))
      .returning();

    if (changed) {
      await logActivity(user.id, user.username, "EXPEDITION_PLANNING_UPDATE",
        `${entry.articleName} — planning du ${entry.planDate} modifié`);
    }
    return NextResponse.json({ plan: updated });
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
  if (entry.loadedQty > 0) return NextResponse.json({ error: "Impossible de supprimer un planning déjà expédié" }, { status: 400 });

  await db.delete(expeditionPlanEntries).where(eq(expeditionPlanEntries.id, id));
  await logActivity(user.id, user.username, "EXPEDITION_PLANNING_DELETE",
    `${entry.articleName} — planning du ${entry.planDate} supprimé`);
  return NextResponse.json({ ok: true });
}
