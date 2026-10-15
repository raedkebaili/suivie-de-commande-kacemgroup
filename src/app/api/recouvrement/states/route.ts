export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recouvrementStates } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";
import { ensureRecouvrementDefaults } from "@/lib/recouvrement";
import { RECOUVREMENT_MANAGER_ROLES } from "@/lib/recouvrement-constants";

async function auth(request: Request, roles?: readonly string[]) {
  const u = await getUserFromHeaders(request);
  if (!u) return { ok: false as const, status: 401, error: "Non authentifié" };
  if (roles && !roles.includes(u.role)) return { ok: false as const, status: 403, error: "Accès refusé" };
  return { ok: true as const, user: u };
}

/**
 * GET /api/recouvrement/states
 * Catalogue des états de recouvrement (triés pour affichage).
 * Lecture : tout utilisateur authentifié (les états s'affichent dans le tableau clients).
 */
export async function GET(request: NextRequest) {
  const a = await auth(request);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });

  try {
    // Seed paresseux idempotent (même pattern que /api/colors et /api/health)
    await ensureRecouvrementDefaults();
    const states = await db
      .select()
      .from(recouvrementStates)
      .orderBy(asc(recouvrementStates.sortOrder), asc(recouvrementStates.label));
    return NextResponse.json({ states });
  } catch (error) {
    console.error("Erreur lecture états recouvrement:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des états" }, { status: 500 });
  }
}

/**
 * POST /api/recouvrement/states
 * Le catalogue initial est volontairement limité aux deux états métier
 * demandés ; aucune valeur préconfigurée supplémentaire ne peut être recréée.
 */
export async function POST(request: NextRequest) {
  const a = await auth(request, RECOUVREMENT_MANAGER_ROLES);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  return NextResponse.json({ error: "Le catalogue est limité à Retard important et Client Bloqué" }, { status: 400 });
}
