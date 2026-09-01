export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appColors, recouvrementStates } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { ensureRecouvrementDefaults } from "@/lib/recouvrement";
import {
  RECOUVREMENT_MANAGER_ROLES,
  recouvrementKeyFromLabel,
} from "@/lib/recouvrement-constants";

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
 * Crée un nouvel état de recouvrement (catalogue enrichissable).
 * Rôles : superadmin, recouvrement.
 * Body: { label, description?, colorKey?, sortOrder? }
 */
export async function POST(request: NextRequest) {
  const a = await auth(request, RECOUVREMENT_MANAGER_ROLES);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });

  try {
    const body = await request.json();
    const label = String(body.label || "").trim();
    const description = String(body.description || "").trim() || null;
    const colorKey = String(body.colorKey || "RECOUVREMENT_GRAY").trim();
    const sortOrder = Number.isFinite(parseInt(body.sortOrder)) ? parseInt(body.sortOrder) : 200;

    if (!label) return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
    if (label.length > 80) return NextResponse.json({ error: "Libellé trop long (80 caractères max)" }, { status: 400 });

    // La colorKey doit référencer une couleur existante (personnalisable via l'onglet Couleurs)
    const [color] = await db.select().from(appColors).where(eq(appColors.key, colorKey)).limit(1);
    if (!color) return NextResponse.json({ error: "Couleur inconnue" }, { status: 400 });

    // Génération d'une clé unique à partir du libellé (suffixe si collision)
    const baseKey = recouvrementKeyFromLabel(label);
    let key = baseKey;
    let suffix = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const [dup] = await db.select({ id: recouvrementStates.id }).from(recouvrementStates).where(eq(recouvrementStates.key, key)).limit(1);
      if (!dup) break;
      key = `${baseKey}_${suffix++}`;
    }

    const [created] = await db.insert(recouvrementStates).values({
      key, label, description, colorKey, sortOrder, active: true,
    }).returning();

    await logActivity(a.user.id, a.user.username, "CREATE_RECOUVREMENT_STATE", `État recouvrement: ${label}`);
    return NextResponse.json({ state: created }, { status: 201 });
  } catch (error) {
    console.error("Erreur création état recouvrement:", error);
    return NextResponse.json({ error: "Erreur lors de la création de l'état" }, { status: 500 });
  }
}
