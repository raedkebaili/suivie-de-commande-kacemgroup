import { db } from "@/db";
import { itemTechnicalComponents, materialCategories, systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_MATERIAL_CATEGORIES } from "./material-categories";
import type { RequirementCategory } from "./material-requirements";
export const GROUPING_CATEGORIES_SETTING = "article_grouping_categories";
export async function readGroupingConfig() {
  const current = await db.select().from(materialCategories);
  // Taxonomie uniquement, aucune donnée commerciale ni identité d'utilisateur.
  const historical = await db.selectDistinct({ key: itemTechnicalComponents.categoryKey, name: itemTechnicalComponents.categoryName }).from(itemTechnicalComponents);
  const categories = new Map<string, RequirementCategory>();
  for (const entry of DEFAULT_MATERIAL_CATEGORIES) categories.set(entry.key, { key: entry.key, name: entry.name, active: true });
  for (const entry of historical.sort((a, b) => a.key.localeCompare(b.key) || a.name.localeCompare(b.name))) if (!categories.has(entry.key)) categories.set(entry.key, { ...entry, active: false });
  for (const entry of current.sort((a, b) => a.sortOrder - b.sortOrder)) categories.set(entry.key, { key: entry.key, name: entry.name, active: entry.active });
  const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, GROUPING_CATEGORIES_SETTING));
  let saved: unknown;
  try { saved = JSON.parse(setting?.value || "null"); } catch { saved = null; }
  const available = [...categories.values()];
  const selectedKeys: string[] = Array.isArray(saved) && saved.every(k => typeof k === "string") ? [...new Set(saved)].filter(k => categories.has(k)) : available.filter(c => c.active).map(c => c.key);
  return { categories: available, selectedKeys, current };
}
