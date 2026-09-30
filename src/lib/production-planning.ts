/**
 * Planning de production — seed serveur des couleurs.
 * Même pattern que archive.ts / recouvrement.ts : insertion par clé si absente,
 * jamais d'écrasement. Les couleurs apparaissent automatiquement comme une
 * section dédiée du gestionnaire de couleurs existant.
 */
import { db } from "@/db";
import { appColors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PLANNING_COLOR_CATEGORY, PLANNING_STATUSES } from "./production-planning-constants";

export async function ensurePlanningColors() {
  for (const s of PLANNING_STATUSES) {
    const [existing] = await db.select({ id: appColors.id }).from(appColors).where(eq(appColors.key, s.colorKey)).limit(1);
    if (!existing) {
      await db.insert(appColors).values({
        key: s.colorKey,
        category: PLANNING_COLOR_CATEGORY,
        label: `Planning — ${s.label}`,
        color: s.defaultColor,
        description: s.description,
        sortOrder: s.sortOrder,
      });
    }
  }
}
