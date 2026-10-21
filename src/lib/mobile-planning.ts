export function canManageMobilePlanning(role: string) { return ["superadmin", "planification"].includes(role); }
export function mobilePlanningQuantity(value: string | number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("La quantité doit être un entier positif.");
  return number;
}
export function expeditionAvailable(produced: number | null | undefined, delivered: number | null | undefined) { return Math.max(0, (produced || 0) - (delivered || 0)); }
export function planningTransitionWarning(status: string): string | null {
  if (status === "TERMINE") return "Terminer cette ligne appliquera la quantité planifiée à la production réelle. Confirmer ?";
  if (status === "LIVRE") return "Valider cette livraison appliquera la quantité au cumul livré et pourra être corrigé par un retour en arrière confirmé en cas d’erreur. Confirmer ?";
  if (status === "ANNULE") return "Annuler cette ligne ? Cette action peut également annuler la commande lorsque tous ses articles sont annulés.";
  return null;
}
