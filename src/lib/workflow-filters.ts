/** Filtres actuels, distincts des états commerciaux et des anciens drapeaux manuels. */
export const WORKFLOW_FILTERS = [
  { key: "prod-order:READY", label: "En attente de livraison", group: "Production — commande entière" },
  { key: "prod-order:UNPLANNED", label: "Non planifiée", group: "Production — commande entière" },
  { key: "prod-order:CANCELLED", label: "Annulée", group: "Production — commande entière" },
  { key: "prod-item:ACTIVE", label: "En cours de production", group: "Production — articles" },
  { key: "prod-item:READY", label: "En attente de livraison", group: "Production — articles" },
  { key: "prod-item:CANCELLED", label: "Annulés", group: "Production — articles" },
  { key: "prod-item:PLANNED", label: "Articles planifiés pour production", group: "Production — articles" },
  { key: "ship-order:DELIVERED", label: "Totalement livrée", group: "Expédition — commande entière" },
  { key: "ship-order:PARTIAL", label: "Partiellement livrée", group: "Expédition — commande entière" },
  { key: "ship-order:UNPLANNED", label: "Non planifiée", group: "Expédition — commande entière" },
  { key: "ship-order:CANCELLED", label: "Annulée", group: "Expédition — commande entière" },
  { key: "ship-item:READY", label: "En attente de livraison", group: "Expédition — articles" },
  { key: "ship-item:DELIVERED", label: "Livrés", group: "Expédition — articles" },
  { key: "ship-item:CANCELLED", label: "Annulés", group: "Expédition — articles" },
  { key: "ship-item:PLANNED", label: "Articles planifiés pour production", group: "Expédition — articles" },
  { key: "ship-item:UNPLANNED", label: "Articles non encore planifiés", group: "Expédition — articles" },
] as const;
export const isArticleWorkflow = (key: string | null | undefined) => Boolean(key?.startsWith("prod-item:") || key?.startsWith("ship-item:"));
export function isWorkflowFilter(value: string | null | undefined) {
  return !value || WORKFLOW_FILTERS.some(filter => filter.key === value);
}
export function appendOrderStateFilter(params: URLSearchParams, value: string) {
  if (value.startsWith("workflow:")) params.set("workflow", value.slice(9));
  else if (value.startsWith("comm:")) params.set("status", value.slice(5));
  else if (value.startsWith("prod:")) params.set("productionStatus", value.slice(5));
  else if (value === "planning:NONE") params.set("workflow", "prod-order:UNPLANNED");
  else if (value.startsWith("planning:")) params.set("planningStatus", value.slice(9));
  else if (value) params.set("status", value);
}

/** Les préférences persistées ne doivent jamais réactiver un ancien filtre supprimé. */
export function normalizeOrderStateFilter(value: unknown): string {
  if (typeof value !== "string") return "";
  if (["comm:PREVISION", "comm:BON_COMMANDE", "comm:SUR_STOCK"].includes(value)) return value;
  if (value.startsWith("workflow:") && value.slice(9) && isWorkflowFilter(value.slice(9))) return value;
  return "";
}
