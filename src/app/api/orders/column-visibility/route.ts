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
const PROD_STATES_KEY = "orders_hidden_production_states";

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

/**
 * États de production masquables individuellement dans la colonne « État Prod. ».
 * Masquer un état n'enlève PAS la colonne ni la ligne : seul le badge concerné
 * est remplacé par un tiret. La logique métier (couleur de ligne, calculs)
 * reste strictement inchangée.
 */
export const HIDEABLE_PRODUCTION_STATES = [
  "EN_INSTANCE",
  "EN_PRODUCTION",
  "AWAITING_DELIVERY",
  "LIVREE",
  "ANNULEE",
] as const;

function parseList(raw: string | undefined | null, allowed: readonly string[]): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && allowed.includes(x));
  } catch {
    return [];
  }
}

/**
 * GET /api/orders/column-visibility
 * Retourne { hiddenColumns, hiddenProductionStates } — tout utilisateur authentifié.
 */
export async function GET(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const [colRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, SETTING_KEY)).limit(1);
    const [stateRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, PROD_STATES_KEY)).limit(1);
    return NextResponse.json({
      hiddenColumns: parseList(colRow?.value, HIDEABLE_ORDER_COLUMNS),
      hiddenProductionStates: parseList(stateRow?.value, HIDEABLE_PRODUCTION_STATES),
    });
  } catch (error) {
    console.error("Erreur lecture visibilité colonnes:", error);
    return NextResponse.json({ error: "Erreur lors de la lecture de la configuration" }, { status: 500 });
  }
}

/** Écrit (ou crée) un paramètre système */
async function upsertSetting(key: string, value: string, description: string, u: { id: number; fullName: string }) {
  const now = new Date().toISOString();
  const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  if (existing) {
    await db.update(systemSettings)
      .set({ value, updatedAt: now, updatedById: u.id, updatedByName: u.fullName })
      .where(eq(systemSettings.key, key));
  } else {
    await db.insert(systemSettings).values({ key, value, description, updatedById: u.id, updatedByName: u.fullName });
  }
}

/**
 * PUT /api/orders/column-visibility
 * Définit les colonnes masquées et/ou les états de production masqués — superadmin uniquement.
 * Body: { hiddenColumns?: string[], hiddenProductionStates?: string[] }
 * Les deux clés sont optionnelles et traitées indépendamment (rétrocompatible).
 */
export async function PUT(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const body = await request.json();
    const hasCols = Array.isArray(body.hiddenColumns);
    const hasStates = Array.isArray(body.hiddenProductionStates);
    if (!hasCols && !hasStates) {
      return NextResponse.json({ error: "hiddenColumns et/ou hiddenProductionStates (tableaux) requis" }, { status: 400 });
    }

    if (hasCols) {
      const hidden = (body.hiddenColumns as unknown[]).filter(
        (x): x is string => typeof x === "string" && (HIDEABLE_ORDER_COLUMNS as readonly string[]).includes(x),
      );
      await upsertSetting(SETTING_KEY, JSON.stringify(hidden), "Colonnes masquées du tableau des commandes (JSON)", u);
      await logActivity(u.id, u.username, "UPDATE_ORDER_COLUMNS", `Colonnes masquées: ${hidden.length > 0 ? hidden.join(", ") : "(aucune)"}`);
    }

    if (hasStates) {
      const hiddenStates = (body.hiddenProductionStates as unknown[]).filter(
        (x): x is string => typeof x === "string" && (HIDEABLE_PRODUCTION_STATES as readonly string[]).includes(x),
      );
      await upsertSetting(PROD_STATES_KEY, JSON.stringify(hiddenStates), "États de production masqués dans le tableau des commandes (JSON)", u);
      await logActivity(u.id, u.username, "UPDATE_ORDER_PROD_STATES", `États production masqués: ${hiddenStates.length > 0 ? hiddenStates.join(", ") : "(aucun)"}`);
    }

    const [colRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, SETTING_KEY)).limit(1);
    const [stateRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, PROD_STATES_KEY)).limit(1);
    return NextResponse.json({
      hiddenColumns: parseList(colRow?.value, HIDEABLE_ORDER_COLUMNS),
      hiddenProductionStates: parseList(stateRow?.value, HIDEABLE_PRODUCTION_STATES),
    });
  } catch (error) {
    console.error("Erreur mise à jour visibilité colonnes:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement de la configuration" }, { status: 500 });
  }
}
