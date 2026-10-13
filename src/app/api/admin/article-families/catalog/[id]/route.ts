export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { articleFamilyCatalog, articleFamilyAssignments } from "@/db/schema";
import { eq, ne, count } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { catalogLabel, hasDuplicateLabel, validateCatalogEntry } from "@/lib/article-family-catalog";

/**
 * PUT /api/admin/article-families/catalog/[id] — modifie une famille (superadmin).
 * Les désignations affectées suivent automatiquement le nouveau libellé.
 * DELETE — supprime une famille ; ses affectations manuelles sont retirées
 * (les désignations reviennent à la classification automatique). Aucune commande n'est modifiée.
 */
async function loadEntry(id: string) {
  const entryId = parseInt(id);
  if (!Number.isFinite(entryId)) return { error: "Identifiant invalide" as const };
  const [entry] = await db.select().from(articleFamilyCatalog).where(eq(articleFamilyCatalog.id, entryId)).limit(1);
  if (!entry) return { error: "Famille introuvable" as const };
  return { entry };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const loaded = await loadEntry(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.error === "Famille introuvable" ? 404 : 400 });

  const check = validateCatalogEntry(await request.json().catch(() => ({})));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  try {
    const others = await db.select().from(articleFamilyCatalog).where(ne(articleFamilyCatalog.id, loaded.entry.id));
    if (hasDuplicateLabel(check.value, others)) {
      return NextResponse.json({ error: `Une famille « ${catalogLabel(check.value)} » existe déjà` }, { status: 409 });
    }
    const [updated] = await db.update(articleFamilyCatalog)
      .set({ ...check.value, updatedAt: new Date().toISOString() })
      .where(eq(articleFamilyCatalog.id, loaded.entry.id)).returning();
    await logActivity(user.id, user.username, "ARTICLE_FAMILY_UPDATE",
      `Famille « ${catalogLabel(loaded.entry)} » → « ${catalogLabel(updated)} »`);
    return NextResponse.json({ entry: updated });
  } catch (error) {
    console.error("Erreur modification famille d'articles:", error);
    return NextResponse.json({ error: "Erreur lors de la modification de la famille" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const loaded = await loadEntry(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.error === "Famille introuvable" ? 404 : 400 });

  try {
    const [{ total }] = await db.select({ total: count() }).from(articleFamilyAssignments)
      .where(eq(articleFamilyAssignments.catalogId, loaded.entry.id));
    // Les affectations sont retirées par la contrainte ON DELETE CASCADE
    await db.delete(articleFamilyCatalog).where(eq(articleFamilyCatalog.id, loaded.entry.id));
    await logActivity(user.id, user.username, "ARTICLE_FAMILY_DELETE",
      `Famille « ${catalogLabel(loaded.entry)} » supprimée (${Number(total)} affectation(s) retirée(s))`);
    return NextResponse.json({ ok: true, removedAssignments: Number(total) });
  } catch (error) {
    console.error("Erreur suppression famille d'articles:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression de la famille" }, { status: 500 });
  }
}
