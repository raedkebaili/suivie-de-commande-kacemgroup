export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

/**
 * Visibilité des colonnes du tableau des commandes.
 * La configuration est globale (stockée dans system_settings) et administrée
 * par le superadmin ; tous les utilisateurs la lisent pour un rendu cohérent.
 * Défaut (clé absente) : toutes les colonnes visibles — comportement historique.
 */

const SETTING_KEY = "orders_hidden_columns";

/** Colonnes masquables du tableau principal (les autres restent toujours visibles) */
export const HIDEABLE_ORDER_COLUMNS = [
  "date",
  "agence",
  "affaire",
  "priorite",
  "etatComm",
  "creePar",
  "modifiePar",
] as const;

function parseHidden(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && (HIDEABLE_ORDER_COLUMNS as readonly string[]).includes(x));
  } catch {
    return [];
  }
}

/**
 * GET /api/orders/column-visibility
 * Retourne { hiddenColumns: string[] } — tout utilisateur authentifié.
 */
export async function GET(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, SETTING_KEY)).limit(1);
    return NextResponse.json({ hiddenColumns: parseHidden(row?.value) });
  } catch (error) {
    console.error("Erreur lecture visibilité colonnes:", error);
    return NextResponse.json({ error: "Erreur lors de la lecture de la configuration" }, { status: 500 });
  }
}

/**
 * PUT /api/orders/column-visibility
 * Définit les colonnes masquées — superadmin uniquement.
 * Body: { hiddenColumns: string[] }
 */
export async function PUT(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const body = await request.json();
    const hidden = Array.isArray(body.hiddenColumns)
      ? body.hiddenColumns.filter((x: unknown): x is string => typeof x === "string" && (HIDEABLE_ORDER_COLUMNS as readonly string[]).includes(x))
      : null;
    if (!hidden) return NextResponse.json({ error: "hiddenColumns (tableau) requis" }, { status: 400 });

    const value = JSON.stringify(hidden);
    const now = new Date().toISOString();
    const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, SETTING_KEY)).limit(1);
    if (existing) {
      await db.update(systemSettings)
        .set({ value, updatedAt: now, updatedById: u.id, updatedByName: u.fullName })
        .where(eq(systemSettings.key, SETTING_KEY));
    } else {
      await db.insert(systemSettings).values({
        key: SETTING_KEY,
        value,
        description: "Colonnes masquées du tableau des commandes (JSON)",
        updatedById: u.id,
        updatedByName: u.fullName,
      });
    }

    await logActivity(u.id, u.username, "UPDATE_ORDER_COLUMNS", `Colonnes masquées: ${hidden.length > 0 ? hidden.join(", ") : "(aucune)"}`);
    return NextResponse.json({ hiddenColumns: hidden });
  } catch (error) {
    console.error("Erreur mise à jour visibilité colonnes:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement de la configuration" }, { status: 500 });
  }
}
