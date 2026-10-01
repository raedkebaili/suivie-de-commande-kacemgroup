export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

/**
 * GET /api/factories/users
 * Liste MINIMALE des utilisateurs actifs (id, nom, rôle) destinée au seul
 * choix du responsable d'usine.
 *
 * Route dédiée et volontairement restreinte : /api/users reste réservée au
 * superadmin (aucune modification de la sécurité existante). Ici, aucune
 * donnée sensible n'est exposée (ni identifiant de connexion, ni hash).
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!["superadmin", "planification"].includes(user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const rows = await db
      .select({ id: users.id, fullName: users.fullName, role: users.role })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.fullName));
    return NextResponse.json({ users: rows });
  } catch (error) {
    console.error("Erreur lecture utilisateurs (usines):", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des utilisateurs" }, { status: 500 });
  }
}
