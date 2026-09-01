/**
 * Recouvrement — fonctions serveur (seed paresseux).
 * Suit le même pattern que src/lib/material-categories.ts :
 * insertion par clé si absente, jamais d'écrasement des données existantes.
 */
import { db } from "@/db";
import { appColors, recouvrementStates } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_RECOUVREMENT_STATES,
  RECOUVREMENT_COLOR_CATEGORY,
  RECOUVREMENT_TONES,
} from "./recouvrement-constants";

/**
 * Insère les couleurs "tones" de recouvrement dans app_colors si absentes.
 * Elles apparaissent ensuite dans l'onglet Couleurs (catégorie "recouvrement")
 * et restent modifiables par le superadmin.
 */
export async function ensureDefaultRecouvrementColors() {
  for (const tone of RECOUVREMENT_TONES) {
    const [existing] = await db.select().from(appColors).where(eq(appColors.key, tone.key)).limit(1);
    if (!existing) {
      await db.insert(appColors).values({
        key: tone.key,
        category: RECOUVREMENT_COLOR_CATEGORY,
        label: tone.label,
        color: tone.color,
        description: "Couleur utilisée par les états de recouvrement",
        sortOrder: tone.sortOrder,
      });
    }
  }
}

/** Insère les états de recouvrement par défaut si absents (par clé). */
export async function ensureDefaultRecouvrementStates() {
  for (const state of DEFAULT_RECOUVREMENT_STATES) {
    const [existing] = await db.select().from(recouvrementStates).where(eq(recouvrementStates.key, state.key)).limit(1);
    if (!existing) {
      await db.insert(recouvrementStates).values({
        key: state.key,
        label: state.label,
        description: state.description,
        colorKey: state.colorKey,
        sortOrder: state.sortOrder,
        active: true,
      });
    }
  }
}

/** Seed complet du module recouvrement (idempotent). */
export async function ensureRecouvrementDefaults() {
  await ensureDefaultRecouvrementColors();
  await ensureDefaultRecouvrementStates();
}
