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
import { eq } from "drizzle-orm";
import { ARCHIVE_COLOR_CATEGORY, ARCHIVE_STATES } from "./archive-constants";

export async function ensureArchiveColors() {
  for (const state of ARCHIVE_STATES) {
    const [existing] = await db.select().from(appColors).where(eq(appColors.key, state.colorKey)).limit(1);
    if (!existing) {
      await db.insert(appColors).values({
        key: state.colorKey,
        category: ARCHIVE_COLOR_CATEGORY,
        label: `Archive — ${state.label}`,
        color: state.defaultColor,
        description: state.description,
        sortOrder: state.sortOrder,
      });
    }
  }
}
