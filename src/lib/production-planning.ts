/**
 * Planning de production — seed serveur des couleurs.
 * Même pattern que archive.ts / recouvrement.ts : insertion par clé si absente,
 * jamais d'écrasement. Les couleurs apparaissent automatiquement comme une
 * section dédiée du gestionnaire de couleurs existant.
 */
import { db } from "@/db";
import { appColors } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { PLANNING_COLOR_CATEGORY, PLANNING_STATUSES } from "./production-planning-constants";

export async function ensurePlanningColors() {
  const keys = PLANNING_STATUSES.map(status => status.colorKey);
  const existing = await db.select({ key: appColors.key })
    .from(appColors)
    .where(inArray(appColors.key, keys));
  const existingKeys = new Set(existing.map(color => color.key));
  const missing = PLANNING_STATUSES.filter(status => !existingKeys.has(status.colorKey));
  if (missing.length === 0) return;

  await db.insert(appColors).values(missing.map(status => ({
    key: status.colorKey,
    category: PLANNING_COLOR_CATEGORY,
    label: `Planning — ${status.label}`,
    color: status.defaultColor,
    description: status.description,
    sortOrder: status.sortOrder,
  }))).onConflictDoNothing({ target: appColors.key });
}
