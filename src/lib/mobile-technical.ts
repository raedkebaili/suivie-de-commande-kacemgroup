import type { TechnicalComponent } from "./types";

export function mobileMaterialIds(components: TechnicalComponent[] = []): number[] {
  return [...new Set(components.flatMap((c) => c.materialId === null ? [] : [c.materialId]))];
}

/** Envoyer uniquement l'article édité, sans toucher aux champs commerciaux ni aux autres articles. */
export function mobileTechnicalPayload(itemId: number, materialIds: number[]) {
  if (!Number.isSafeInteger(itemId) || itemId <= 0) throw new Error("Article invalide");
  return { dynamicTechItems: [{ itemId, materialIds: [...new Set(materialIds.filter((id) => Number.isSafeInteger(id) && id > 0))] }] };
}
