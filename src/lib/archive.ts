/**
 * Archive commandes — seed serveur des couleurs d'états.
 * Même pattern que material-categories.ts / recouvrement.ts :
 * insertion par clé si absente, jamais d'écrasement.
 *
 * Les couleurs sont ajoutées à la table app_colors existante avec la
 * catégorie "archive" : elles apparaissent donc automatiquement comme une
 * NOUVELLE SECTION du gestionnaire de couleurs existant, sans dupliquer
 * ni modifier celui-ci.
 */
import { db } from "@/db";
import { appColors } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { ARCHIVE_COLOR_CATEGORY, ARCHIVE_STATES } from "./archive-constants";

export async function ensureArchiveColors() {
  const keys = ARCHIVE_STATES.map(state => state.colorKey);
  const existing = await db.select({ key: appColors.key })
    .from(appColors)
    .where(inArray(appColors.key, keys));
  const existingKeys = new Set(existing.map(color => color.key));
  const missing = ARCHIVE_STATES.filter(state => !existingKeys.has(state.colorKey));
  if (missing.length === 0) return;

  await db.insert(appColors).values(missing.map(state => ({
    key: state.colorKey,
    category: ARCHIVE_COLOR_CATEGORY,
    label: `Archive — ${state.label}`,
    color: state.defaultColor,
    description: state.description,
    sortOrder: state.sortOrder,
  }))).onConflictDoNothing({ target: appColors.key });
}
