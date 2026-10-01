export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { factories, productionPlanEntries, users } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

const MANAGER_ROLES = ["superadmin", "planification"];

/** PUT /api/factories/[id] — modifie une usine (code, nom, responsable, actif) */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!MANAGER_ROLES.includes(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const fid = parseInt(id);
  if (!Number.isFinite(fid)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [existing] = await db.select().from(factories).where(eq(factories.id, fid)).limit(1);
    if (!existing) return NextResponse.json({ error: "Usine non trouvée" }, { status: 404 });

    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (body.code !== undefined) {
      const code = String(body.code || "").trim().toUpperCase();
      if (!code) return NextResponse.json({ error: "Code requis" }, { status: 400 });
      const [dup] = await db.select({ id: factories.id }).from(factories).where(eq(factories.code, code)).limit(1);
      if (dup && dup.id !== fid) return NextResponse.json({ error: "Ce code usine existe déjà" }, { status: 400 });
      updates.code = code;
    }
    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
      const [dup] = await db.select({ id: factories.id }).from(factories).where(eq(factories.name, name)).limit(1);
      if (dup && dup.id !== fid) return NextResponse.json({ error: "Ce nom d'usine existe déjà" }, { status: 400 });
      updates.name = name;
    }
    if (body.responsableId !== undefined) {
      const rid = parseInt(String(body.responsableId));
      if (!Number.isFinite(rid)) return NextResponse.json({ error: "Responsable requis" }, { status: 400 });
      const [resp] = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.id, rid)).limit(1);
      if (!resp) return NextResponse.json({ error: "Responsable introuvable" }, { status: 400 });
      updates.responsableId = resp.id;
      updates.responsableName = resp.fullName;
    }
    if (body.active !== undefined) updates.active = !!body.active;

    const [updated] = await db.update(factories).set(updates).where(eq(factories.id, fid)).returning();
    await logActivity(user.id, user.username, "UPDATE_FACTORY", `Usine: ${updated.name} (${updated.code})`);
    return NextResponse.json({ factory: updated });
  } catch (error) {
    console.error("Erreur mise à jour usine:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

/**
 * DELETE /api/factories/[id]
 * Refusé si l'usine est utilisée par au moins une ligne de planning
 * (préserve l'historique de production).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!MANAGER_ROLES.includes(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const fid = parseInt(id);
  if (!Number.isFinite(fid)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [existing] = await db.select().from(factories).where(eq(factories.id, fid)).limit(1);
    if (!existing) return NextResponse.json({ error: "Usine non trouvée" }, { status: 404 });

    const [usage] = await db.select({ c: count() }).from(productionPlanEntries).where(eq(productionPlanEntries.factoryId, fid));
    if ((usage?.c || 0) > 0) {
      return NextResponse.json({
        error: `Impossible de supprimer : cette usine est utilisée par ${usage.c} ligne(s) de planning. Désactivez-la plutôt.`,
      }, { status: 400 });
    }

    await db.delete(factories).where(eq(factories.id, fid));
    await logActivity(user.id, user.username, "DELETE_FACTORY", `Usine supprimée: ${existing.name}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erreur suppression usine:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
