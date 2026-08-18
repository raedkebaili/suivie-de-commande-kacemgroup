// Catégories techniques prédéfinies — doivent correspondre exactement
// aux champs remplis par le service technique dans le détail des articles.
export const TECH_CATEGORIES = [
  { key: "pcb", label: "PCB" },
  { key: "colorTemperature", label: "Température de Couleur" },
  { key: "lens", label: "Lentille" },
  { key: "driver", label: "Driver" },
  { key: "electricalClass", label: "Classe Électrique" },
  { key: "accessories", label: "Accessoires" },
  { key: "otherTechSpecs", label: "Autres Spécifications" },
] as const;

export type TechCategoryKey = typeof TECH_CATEGORIES[number]["key"];

export function techCategoryLabel(key: string): string {
  return TECH_CATEGORIES.find(c => c.key === key)?.label || key;
}
