export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import {
  canManageOrderColumnVisibility,
  HIDEABLE_ORDER_COLUMNS,
  HIDEABLE_PRODUCTION_STATES,
  parseStoredList,
  sanitizeList,
} from "@/lib/order-column-visibility";

/**
 * Visibilité des colonnes du tableau des commandes.
 * La configuration est globale (stockée dans system_settings) et administrée
 * par le superadmin ; tous les utilisateurs la lisent pour un rendu cohérent.
 * Défaut (clé absente) : toutes les colonnes visibles — comportement historique.
 */

const SETTING_KEY = "orders_hidden_columns";
const PROD_STATES_KEY = "orders_hidden_production_states";
const HIDE_TOTAL_ROW_KEY = "orders_hide_total_row";

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
    const [totalRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, HIDE_TOTAL_ROW_KEY)).limit(1);
    return NextResponse.json({
      hiddenColumns: parseStoredList(colRow?.value, HIDEABLE_ORDER_COLUMNS),
      hiddenProductionStates: parseStoredList(stateRow?.value, HIDEABLE_PRODUCTION_STATES),
      hideTotalRow: totalRow?.value === "true",
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
  if (!canManageOrderColumnVisibility(u.role)) return NextResponse.json({ error: "Accès refusé : seul le superadmin modifie l'affichage global" }, { status: 403 });

  try {
    const body = await request.json();
    const hasCols = Array.isArray(body.hiddenColumns);
    const hasStates = Array.isArray(body.hiddenProductionStates);
    const hasTotal = typeof body.hideTotalRow === "boolean";
    if (!hasCols && !hasStates && !hasTotal) {
      return NextResponse.json({ error: "hiddenColumns, hiddenProductionStates et/ou hideTotalRow requis" }, { status: 400 });
    }

    if (hasCols) {
      const hidden = sanitizeList(body.hiddenColumns, HIDEABLE_ORDER_COLUMNS);
      await upsertSetting(SETTING_KEY, JSON.stringify(hidden), "Colonnes masquées du tableau des commandes (JSON)", u);
      await logActivity(u.id, u.username, "UPDATE_ORDER_COLUMNS", `Colonnes masquées: ${hidden.length > 0 ? hidden.join(", ") : "(aucune)"}`);
    }

    if (hasStates) {
      const hiddenStates = sanitizeList(body.hiddenProductionStates, HIDEABLE_PRODUCTION_STATES);
      await upsertSetting(PROD_STATES_KEY, JSON.stringify(hiddenStates), "États de production masqués dans le tableau des commandes (JSON)", u);
      await logActivity(u.id, u.username, "UPDATE_ORDER_PROD_STATES", `États production masqués: ${hiddenStates.length > 0 ? hiddenStates.join(", ") : "(aucun)"}`);
    }

    if (hasTotal) {
      const hide = body.hideTotalRow === true;
      await upsertSetting(HIDE_TOTAL_ROW_KEY, hide ? "true" : "false", "Masquer la ligne TOTAL du tableau des commandes", u);
      await logActivity(u.id, u.username, "UPDATE_ORDER_TOTAL_ROW", `Ligne TOTAL: ${hide ? "masquée" : "affichée"}`);
    }

    const [colRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, SETTING_KEY)).limit(1);
    const [stateRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, PROD_STATES_KEY)).limit(1);
    const [totalRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, HIDE_TOTAL_ROW_KEY)).limit(1);
    return NextResponse.json({
      hiddenColumns: parseStoredList(colRow?.value, HIDEABLE_ORDER_COLUMNS),
      hiddenProductionStates: parseStoredList(stateRow?.value, HIDEABLE_PRODUCTION_STATES),
      hideTotalRow: totalRow?.value === "true",
    });
  } catch (error) {
    console.error("Erreur mise à jour visibilité colonnes:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement de la configuration" }, { status: 500 });
  }
}
