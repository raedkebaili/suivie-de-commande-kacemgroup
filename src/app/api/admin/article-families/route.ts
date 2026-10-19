export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, articleFamilyCatalog, articleFamilyAssignments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";
import { ARTICLE_FAMILY_STATUS, UNCLASSIFIED_GROUP_KEY } from "@/lib/article-family";
import { createArticleRecognizer } from "@/lib/article-recognition";
import { catalogLabel } from "@/lib/article-family-catalog";

/**
 * GET /api/admin/article-families
 * Référentiel des familles d'articles (lecture seule).
 * Une ligne par désignation originale présente dans les commandes, avec sa famille
 * effective (affectation manuelle > classification automatique) et le catalogue.
 * Les désignations ne sont jamais modifiées. Réservé au superadmin.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    // Agrégation SQL : une ligne par désignation exacte, sans double comptage
    const rows = await db
      .select({
        designation: orderItems.articleName,
        occurrences: sql<number>`count(*)::int`,
        orderCount: sql<number>`count(distinct ${orderItems.orderId})::int`,
        totalQuantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      })
      .from(orderItems)
      .groupBy(orderItems.articleName);

    const catalog = await db.select().from(articleFamilyCatalog);
    const assignments = await db
      .select({ designation: articleFamilyAssignments.designation, catalogId: articleFamilyAssignments.catalogId })
      .from(articleFamilyAssignments);

    const catalogById = new Map(catalog.map((c) => [c.id, c]));
    const assignmentByDesignation = new Map(assignments.map((a) => [a.designation, a.catalogId]));
    const usage = new Map<number, number>();
    for (const a of assignments) usage.set(a.catalogId, (usage.get(a.catalogId) || 0) + 1);

    const recognize = createArticleRecognizer(catalog, new Map(assignments.flatMap(assignment => {
      const entry = catalogById.get(assignment.catalogId);
      return entry ? [[assignment.designation, catalogLabel(entry)] as const] : [];
    })));
    const items = rows.map((r) => {
      const manualId = assignmentByDesignation.get(r.designation) ?? null;
      const manual = manualId !== null ? catalogById.get(manualId) : undefined;
      const resolved = recognize(r.designation);
      return {
        designation: r.designation,
        status: resolved.status,
        familyKey: resolved.familyKey,
        source: resolved.source,
        category: resolved.category,
        catalogId: manual ? manual.id : null,
        power: resolved.power,
        occurrences: Number(r.occurrences),
        orderCount: Number(r.orderCount),
        totalQuantity: Number(r.totalQuantity),
      };
    }).sort((a, b) => {
      const ka = a.familyKey ?? UNCLASSIFIED_GROUP_KEY;
      const kb = b.familyKey ?? UNCLASSIFIED_GROUP_KEY;
      if (ka !== kb) {
        if (ka === UNCLASSIFIED_GROUP_KEY) return 1;
        if (kb === UNCLASSIFIED_GROUP_KEY) return -1;
        return ka.localeCompare(kb, "fr");
      }
      return a.designation.localeCompare(b.designation, "fr");
    });

    const families = [...new Set(items.filter(i => i.familyKey).map(i => i.familyKey as string))]
      .sort((a, b) => a.localeCompare(b, "fr"));

    return NextResponse.json({
      items,
      families,
      catalog: catalog
        .map((c) => ({ id: c.id, category: c.category, subFamily: c.subFamily, variant: c.variant, label: catalogLabel(c), designationCount: usage.get(c.id) || 0 }))
        .sort((a, b) => a.category.localeCompare(b.category, "fr") || a.label.localeCompare(b.label, "fr")),
      summary: {
        designations: items.length,
        recognized: items.filter(i => i.status === ARTICLE_FAMILY_STATUS.RECONNU).length,
        toClassify: items.filter(i => i.status === ARTICLE_FAMILY_STATUS.A_CLASSIFIER).length,
        manual: items.filter(i => i.source === "MANUEL").length,
        families: families.length,
        occurrences: items.reduce((s, i) => s + i.occurrences, 0),
      },
    });
  } catch (error) {
    console.error("Erreur référentiel familles d'articles:", error);
    return NextResponse.json({ error: "Erreur lors du chargement du référentiel" }, { status: 500 });
  }
}
