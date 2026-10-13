export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";
import { classifyArticleDesignation, ARTICLE_FAMILY_STATUS, UNCLASSIFIED_GROUP_KEY } from "@/lib/article-family";

/**
 * GET /api/admin/article-families
 * Référentiel automatique des familles d'articles (lecture seule).
 * Une ligne par désignation originale présente dans les commandes.
 * Les désignations ne sont jamais modifiées ; aucune écriture n'est possible ici.
 * Réservé au superadmin (même règle que les autres outils d'administration).
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

    const items = rows.map((r) => {
      const info = classifyArticleDesignation(r.designation);
      return {
        designation: r.designation,
        status: info.status,
        family: info.family,
        generation: info.generation,
        power: info.power,
        familyKey: info.familyKey,
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
      return (a.power ?? Infinity) - (b.power ?? Infinity) || a.designation.localeCompare(b.designation, "fr");
    });

    const families = [...new Set(items.filter(i => i.familyKey).map(i => i.familyKey as string))]
      .sort((a, b) => a.localeCompare(b, "fr"));

    return NextResponse.json({
      items,
      families,
      summary: {
        designations: items.length,
        recognized: items.filter(i => i.status === ARTICLE_FAMILY_STATUS.RECONNU).length,
        toClassify: items.filter(i => i.status === ARTICLE_FAMILY_STATUS.A_CLASSIFIER).length,
        families: families.length,
        occurrences: items.reduce((s, i) => s + i.occurrences, 0),
      },
    });
  } catch (error) {
    console.error("Erreur référentiel familles d'articles:", error);
    return NextResponse.json({ error: "Erreur lors du chargement du référentiel" }, { status: 500 });
  }
}
