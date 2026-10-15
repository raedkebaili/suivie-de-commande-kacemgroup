import type { OrderItem } from "./types";
/** Whitelist commerciale : préserver les champs existants sans envoyer les données techniques. */
export function commercialItemsPayload(items: OrderItem[]) {
  if (!items.length) throw new Error("Ajoutez au moins un article.");
  return items.map((item) => {
    if (!item.articleName.trim() || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error("Chaque article doit avoir un nom et une quantité entière positive.");
    if (item.quantity < Math.max(item.producedQty || 0, item.deliveredQty || 0)) throw new Error("La quantité ne peut pas être inférieure au cumul produit ou livré.");
    return { id: item.id, articleName: item.articleName.trim(), quantity: item.quantity, note: item.note, clientSpec: item.clientSpec, isTelegestion: item.isTelegestion, productionUnit: item.productionUnit, plannedLoadingDate: item.plannedLoadingDate, unitPrice: item.unitPrice, description: item.description };
  });
}
