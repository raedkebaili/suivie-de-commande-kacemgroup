import { db } from "@/db";
import { materialCategories } from "@/db/schema";
import { eq } from "drizzle-orm";

export const DEFAULT_MATERIAL_CATEGORIES = [
  { key: "pcb", name: "PCB", isTelegestion: false, sortOrder: 10 },
  { key: "colorTemperature", name: "Température de couleur", isTelegestion: false, sortOrder: 20 },
  { key: "lens", name: "Lentille", isTelegestion: false, sortOrder: 30 },
  { key: "driver", name: "Driver", isTelegestion: false, sortOrder: 40 },
  { key: "electricalClass", name: "Classe électrique", isTelegestion: false, sortOrder: 50 },
  { key: "accessories", name: "Accessoires", isTelegestion: false, sortOrder: 60 },
  { key: "otherTechSpecs", name: "Autres spécifications", isTelegestion: false, sortOrder: 70 },
  { key: "telegestion-accessories", name: "Accessoire de télégestion", isTelegestion: true, sortOrder: 80 },
] as const;

export function categoryKeyFromName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `categorie-${Date.now()}`;
}

export async function ensureDefaultMaterialCategories() {
  for (const category of DEFAULT_MATERIAL_CATEGORIES) {
    const [existing] = await db.select().from(materialCategories).where(eq(materialCategories.key, category.key)).limit(1);
    if (!existing) await db.insert(materialCategories).values(category);
  }
}
