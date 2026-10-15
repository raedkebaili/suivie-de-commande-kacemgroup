export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { articleFamilyCatalog } from "@/db/schema";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { catalogLabel, hasDuplicateLabel, validateCatalogEntry } from "@/lib/article-family-catalog";

/**
 * POST /api/admin/article-families/catalog
 * Crée une famille du catalogue (FAMILLE / SOUS FAMILLE / VARIANTE). Superadmin uniquement.
 * Refuse un libellé de regroupement déjà utilisé (insensible à la casse).
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const check = validateCatalogEntry(await request.json().catch(() => ({})));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  try {
    const existing = await db.select().from(articleFamilyCatalog);
    if (hasDuplicateLabel(check.value, existing)) {
      return NextResponse.json({ error: `Une famille « ${catalogLabel(check.value)} » existe déjà` }, { status: 409 });
    }
    const [created] = await db.insert(articleFamilyCatalog).values(check.value).returning();
    await logActivity(user.id, user.username, "ARTICLE_FAMILY_CREATE", `Famille « ${catalogLabel(created)} » (${created.category})`);
    return NextResponse.json({ entry: created }, { status: 201 });
  } catch (error) {
    console.error("Erreur création famille d'articles:", error);
    return NextResponse.json({ error: "Erreur lors de la création de la famille" }, { status: 500 });
  }
}
