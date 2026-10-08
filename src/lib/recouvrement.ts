/**
 * Recouvrement — initialisation et migration du catalogue d'états.
 * Les anciennes valeurs préconfigurées sont supprimées une seule fois ; le
 * catalogue initial ne contient ensuite que les deux états demandés.
 */
import { db } from "@/db";
import { appColors, clientRecouvrementStates, recouvrementStates, systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_RECOUVREMENT_STATES,
  RECOUVREMENT_COLOR_CATEGORY,
  RECOUVREMENT_TONES,
} from "./recouvrement-constants";

const STATES_MIGRATION_KEY = "recouvrement_states_catalog_v2";

/** Insère les couleurs proposées si elles n'existent pas déjà. */
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

/**
 * Nettoie les anciennes valeurs et installe le catalogue initial demandé.
 * Le marqueur évite qu'une suppression volontaire d'un état soit annulée au
 * prochain GET. Les affectations courantes des états retirés sont supprimées
 * explicitement avant la suppression du catalogue (FK restrictive).
 */
export async function ensureDefaultRecouvrementStates() {
  const [migration] = await db.select().from(systemSettings).where(eq(systemSettings.key, STATES_MIGRATION_KEY)).limit(1);
  if (migration) return;

  const existingStates = await db.select().from(recouvrementStates);
  const desiredKeys = new Set(DEFAULT_RECOUVREMENT_STATES.map((state) => state.key));

  for (const existing of existingStates) {
    if (!desiredKeys.has(existing.key)) {
      await db.delete(clientRecouvrementStates).where(eq(clientRecouvrementStates.stateId, existing.id));
      await db.delete(recouvrementStates).where(eq(recouvrementStates.id, existing.id));
    }
  }

  for (const desired of DEFAULT_RECOUVREMENT_STATES) {
    const current = existingStates.find((state) => state.key === desired.key);
    if (current) {
      await db.update(recouvrementStates).set({
        label: desired.label,
        description: desired.description,
        colorKey: desired.colorKey,
        sortOrder: desired.sortOrder,
        active: true,
        updatedAt: new Date().toISOString(),
      }).where(eq(recouvrementStates.id, current.id));
    } else {
      await db.insert(recouvrementStates).values({
        key: desired.key,
        label: desired.label,
        description: desired.description,
        colorKey: desired.colorKey,
        sortOrder: desired.sortOrder,
        active: true,
      }).onConflictDoNothing({ target: recouvrementStates.key });
    }
  }

  await db.insert(systemSettings).values({
    key: STATES_MIGRATION_KEY,
    value: "true",
    description: "Catalogue recouvrement initial réduit à Retard important et Client Bloqué",
  }).onConflictDoNothing({ target: systemSettings.key });
}

export async function ensureRecouvrementDefaults() {
  await ensureDefaultRecouvrementColors();
  await ensureDefaultRecouvrementStates();
}
