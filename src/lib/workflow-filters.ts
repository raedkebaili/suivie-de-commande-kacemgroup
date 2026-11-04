/** Filtres actuels, distincts des états commerciaux et des anciens drapeaux manuels. */
export const WORKFLOW_FILTERS = [
  { key: "READY", label: "Prête à livrer", group: "Avancement réel" },
  { key: "DELIVERY", label: "En cours de livraison", group: "Avancement réel" },
  { key: "DELIVERED", label: "Livrée", group: "Avancement réel" },
  { key: "CANCELLED", label: "Commande annulée", group: "Avancement réel" },
  { key: "production:EN_ATTENTE", label: "En attente de démarrage", group: "Planning production" },
  { key: "production:EN_COURS", label: "En cours de production", group: "Planning production" },
  { key: "production:SUSPENDU", label: "Suspendu", group: "Planning production" },
  { key: "production:ANNULE", label: "Annulé (planning production)", group: "Planning production" },
  { key: "production:TERMINE", label: "Terminé (production)", group: "Planning production" },
  { key: "expedition:NON_TRAITE", label: "En attente d’expédition", group: "Planning expédition" },
  { key: "expedition:EN_COURS", label: "En cours de livraison (planning)", group: "Planning expédition" },
  { key: "expedition:LIVRE", label: "Livré (planning expédition)", group: "Planning expédition" },
  { key: "expedition:ANNULE", label: "Annulé (planning expédition)", group: "Planning expédition" },
  { key: "UNPLANNED", label: "Sans planning actif de production ni d’expédition", group: "Planification" },
] as const;
export function isWorkflowFilter(value: string | null | undefined) {
  return !value || WORKFLOW_FILTERS.some(filter => filter.key === value);
}
export function appendOrderStateFilter(params: URLSearchParams, value: string) {
  if (value.startsWith("workflow:")) params.set("workflow", value.slice(9));
  else if (value.startsWith("comm:")) params.set("status", value.slice(5));
  else if (value.startsWith("prod:")) params.set("productionStatus", value.slice(5));
  else if (value === "planning:NONE") params.set("workflow", "UNPLANNED");
  else if (value.startsWith("planning:")) params.set("planningStatus", value.slice(9));
  else if (value) params.set("status", value);
}
