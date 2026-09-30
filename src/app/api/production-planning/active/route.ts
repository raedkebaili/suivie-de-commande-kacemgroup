export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productionPlanEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

/**
 * GET /api/production-planning/active
 * Articles actuellement EN COURS DE PRODUCTION d'après le planning
 * (toutes journées confondues : une production peut s'étaler sur plusieurs jours).
 *
 * Utilisé par le tableau des commandes pour afficher l'alerte visuelle
 * (alternance de couleur) sur les articles en cours. Lecture ouverte à tout
 * utilisateur authentifié : c'est une information d'affichage.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const rows = await db
      .select({
        id: productionPlanEntries.id,
        itemId: productionPlanEntries.itemId,
        orderId: productionPlanEntries.orderId,
        planDate: productionPlanEntries.planDate,
        plannedQty: productionPlanEntries.plannedQty,
        articleName: productionPlanEntries.articleName,
      })
      .from(productionPlanEntries)
      .where(eq(productionPlanEntries.status, "EN_COURS"));

    return NextResponse.json({
      active: rows,
      itemIds: [...new Set(rows.map((r) => r.itemId))],
      orderIds: [...new Set(rows.map((r) => r.orderId))],
    });
  } catch (error) {
    console.error("Erreur lecture planning actif:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération du planning actif" }, { status: 500 });
  }
}
