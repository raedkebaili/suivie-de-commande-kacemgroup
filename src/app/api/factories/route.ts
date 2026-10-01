export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { factories, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

// Gestion des usines (unités de production) : superadmin + planification
const MANAGER_ROLES = ["superadmin", "planification"];

/**
 * GET /api/factories
 * Liste des usines. Lecture ouverte à tout utilisateur authentifié :
 * le tableau des commandes doit pouvoir filtrer par usine.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const rows = await db.select().from(factories).orderBy(asc(factories.name));
    return NextResponse.json({ factories: rows });
  } catch (error) {
    console.error("Erreur lecture usines:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des usines" }, { status: 500 });
  }
}

/**
 * POST /api/factories
 * Crée une usine. Le responsable est OBLIGATOIREMENT un utilisateur existant.
 * Body: { code, name, responsableId }
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!MANAGER_ROLES.includes(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const body = await request.json();
    const code = String(body.code || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const responsableId = parseInt(String(body.responsableId));

    if (!code || !name) return NextResponse.json({ error: "Code et nom requis" }, { status: 400 });
    if (!Number.isFinite(responsableId)) {
      return NextResponse.json({ error: "Responsable requis (utilisateur de la plateforme)" }, { status: 400 });
    }

    // Le responsable doit exister dans la table des utilisateurs
    const [resp] = await db.select({ id: users.id, fullName: users.fullName })
      .from(users).where(eq(users.id, responsableId)).limit(1);
    if (!resp) return NextResponse.json({ error: "Responsable introuvable" }, { status: 400 });

    const [dupCode] = await db.select({ id: factories.id }).from(factories).where(eq(factories.code, code)).limit(1);
    if (dupCode) return NextResponse.json({ error: "Ce code usine existe déjà" }, { status: 400 });
    const [dupName] = await db.select({ id: factories.id }).from(factories).where(eq(factories.name, name)).limit(1);
    if (dupName) return NextResponse.json({ error: "Ce nom d'usine existe déjà" }, { status: 400 });

    const [created] = await db.insert(factories).values({
      code, name, responsableId: resp.id, responsableName: resp.fullName, active: true,
    }).returning();

    await logActivity(user.id, user.username, "CREATE_FACTORY", `Usine: ${name} (${code}) — responsable ${resp.fullName}`);
    return NextResponse.json({ factory: created }, { status: 201 });
  } catch (error) {
    console.error("Erreur création usine:", error);
    return NextResponse.json({ error: "Erreur lors de la création de l'usine" }, { status: 500 });
  }
}
