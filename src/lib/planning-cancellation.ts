/**
 * Annulations issues du planning de production (partagé client + serveur).
 * NE PAS importer "@/db" ici.
 *
 * - Un article est annulé dans le planning lorsqu'il possède au moins une ligne
 *   de planning et que toutes ses lignes sont « Annulé ».
 * - Une commande est annulée depuis le planning lorsque TOUS ses articles le
 *   sont. Elle passe alors au statut commande « Annulée » (ANNULEE).
 */

export const PLANNING_ORDER_CANCEL_REASON = "Annulée depuis le planning : tous les articles ont été annulés";

export type PlanningEntryLite = { itemId: number; status: string };

export function orderCancelledFromPlanning(itemIds: number[], entries: PlanningEntryLite[]): boolean {
  if (itemIds.length === 0) return false;
  return itemIds.every((itemId) => {
    const mine = entries.filter((e) => e.itemId === itemId);
    return mine.length > 0 && mine.every((e) => e.status === "ANNULE");
  });
}

export type PlanningCancelledLine = { articleName: string; status: string; reason: string | null; appliedAt: string | null };

/**
 * Causes d'annulation affichées sur la ligne de commande : « Article : motif ».
 * Seules les lignes ANNULE, non appliquées et avec un motif sont retenues.
 */
export function planningCancelCauses(lines: PlanningCancelledLine[]): string[] {
  const causes: string[] = [];
  for (const line of lines) {
    if (line.status !== "ANNULE" || line.appliedAt) continue;
    const reason = (line.reason || "").trim();
    if (!reason) continue;
    const text = `${line.articleName} : ${reason}`;
    if (!causes.includes(text)) causes.push(text);
  }
  return causes;
}
