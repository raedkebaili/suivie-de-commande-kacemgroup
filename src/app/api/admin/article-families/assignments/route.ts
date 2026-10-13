export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, articleFamilyCatalog, articleFamilyAssignments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { catalogLabel } from "@/lib/article-family-catalog";

/**
 * PUT /api/admin/article-families/assignments
 * Body : { designation: string, catalogId: number | null }
 * - catalogId renseigné : affecte la désignation à cette famille (remplace l'affectation existante).
 * - catalogId null : retire l'affectation manuelle (retour à la classification automatique).
 * Ne modifie jamais la désignation, les commandes, les quantités ni les statuts.
 * Superadmin uniquement.
 */
export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { designation?: unknown; catalogId?: unknown };
  const designation = typeof body.designation === "string" ? body.designation : "";
  if (!designation.trim()) return NextResponse.json({ error: "Désignation requise" }, { status: 400 });
  const catalogId = body.catalogId === null || body.catalogId === undefined || body.catalogId === ""
    ? null : parseInt(String(body.catalogId));
  if (catalogId !== null && !Number.isFinite(catalogId)) return NextResponse.json({ error: "Famille invalide" }, { status: 400 });

  try {
    const [seen] = await db.select({ id: orderItems.id }).from(orderItems)
      .where(eq(orderItems.articleName, designation)).limit(1);
    if (!seen) return NextResponse.json({ error: "Désignation absente des commandes" }, { status: 404 });

    if (catalogId === null) {
      await db.delete(articleFamilyAssignments).where(eq(articleFamilyAssignments.designation, designation));
      await logActivity(user.id, user.username, "ARTICLE_FAMILY_UNASSIGN", `« ${designation} » → classification automatique`);
      return NextResponse.json({ assignment: null });
    }

    const [entry] = await db.select().from(articleFamilyCatalog).where(eq(articleFamilyCatalog.id, catalogId)).limit(1);
    if (!entry) return NextResponse.json({ error: "Famille introuvable" }, { status: 404 });

    const now = new Date().toISOString();
    const [saved] = await db.insert(articleFamilyAssignments)
      .values({ designation, catalogId: entry.id, assignedByName: user.fullName, assignedAt: now })
      .onConflictDoUpdate({
        target: articleFamilyAssignments.designation,
        set: { catalogId: entry.id, assignedByName: user.fullName, assignedAt: now },
      })
      .returning();
    await logActivity(user.id, user.username, "ARTICLE_FAMILY_ASSIGN", `« ${designation} » → « ${catalogLabel(entry)} »`);
    return NextResponse.json({ assignment: { designation: saved.designation, catalogId: saved.catalogId, label: catalogLabel(entry) } });
  } catch (error) {
    console.error("Erreur affectation famille d'articles:", error);
    return NextResponse.json({ error: "Erreur lors de l'affectation" }, { status: 500 });
  }
}
