export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appColors, clientRecouvrementStates, recouvrementStates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { DEFAULT_RECOUVREMENT_STATES, RECOUVREMENT_MANAGER_ROLES } from "@/lib/recouvrement-constants";

async function auth(request: Request, roles?: readonly string[]) {
  const u = await getUserFromHeaders(request);
  if (!u) return { ok: false as const, status: 401, error: "Non authentifié" };
  if (roles && !roles.includes(u.role)) return { ok: false as const, status: 403, error: "Accès refusé" };
  return { ok: true as const, user: u };
}

/**
 * PUT /api/recouvrement/states/[id]
 * Modifie un état du catalogue (libellé, description, couleur, ordre, activation).
 * Rôles : superadmin, recouvrement.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth(request, RECOUVREMENT_MANAGER_ROLES);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { id } = await params;
  const stateId = parseInt(id);
  if (!Number.isFinite(stateId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [existing] = await db.select().from(recouvrementStates).where(eq(recouvrementStates.id, stateId)).limit(1);
    if (!existing) return NextResponse.json({ error: "État non trouvé" }, { status: 404 });

    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (body.label !== undefined) {
      const label = String(body.label || "").trim();
      if (!label) return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
      if (!DEFAULT_RECOUVREMENT_STATES.some((state) => state.label === label)) {
        return NextResponse.json({ error: "Seuls les états Retard important et Client Bloqué sont autorisés" }, { status: 400 });
      }
      updates.label = label;
    }
    if (body.description !== undefined) updates.description = String(body.description || "").trim() || null;
    if (body.colorKey !== undefined) {
      const [color] = await db.select().from(appColors).where(eq(appColors.key, body.colorKey)).limit(1);
      if (!color) return NextResponse.json({ error: "Couleur inconnue" }, { status: 400 });
      updates.colorKey = body.colorKey;
    }
    if (body.sortOrder !== undefined) {
      const so = parseInt(body.sortOrder);
      if (!Number.isFinite(so)) return NextResponse.json({ error: "Ordre invalide" }, { status: 400 });
      updates.sortOrder = so;
    }
    if (body.active !== undefined) updates.active = !!body.active;

    const [updated] = await db.update(recouvrementStates).set(updates).where(eq(recouvrementStates.id, stateId)).returning();
    await logActivity(a.user.id, a.user.username, "UPDATE_RECOUVREMENT_STATE", `État recouvrement #${stateId}: ${updated.label}`);
    return NextResponse.json({ state: updated });
  } catch (error) {
    console.error("Erreur mise à jour état recouvrement:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour de l'état" }, { status: 500 });
  }
}

/**
 * DELETE /api/recouvrement/states/[id]
 * Supprime un état du catalogue et retire ses affectations courantes.
 * Les journaux historiques sont conservés ; leur FK met l'état à null.
 * Rôles : superadmin, recouvrement.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth(request, RECOUVREMENT_MANAGER_ROLES);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { id } = await params;
  const stateId = parseInt(id);
  if (!Number.isFinite(stateId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [existing] = await db.select().from(recouvrementStates).where(eq(recouvrementStates.id, stateId)).limit(1);
    if (!existing) return NextResponse.json({ error: "État non trouvé" }, { status: 404 });

    // La FK des affectations est restrictive : retirer d'abord les liens
    // courants permet enfin de supprimer un état réellement utilisé.
    await db.delete(clientRecouvrementStates).where(eq(clientRecouvrementStates.stateId, stateId));
    await db.delete(recouvrementStates).where(eq(recouvrementStates.id, stateId));
    await logActivity(a.user.id, a.user.username, "DELETE_RECOUVREMENT_STATE", `État recouvrement supprimé: ${existing.label}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erreur suppression état recouvrement:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression de l'état" }, { status: 500 });
  }
}
