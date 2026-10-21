/** Périmètre du besoin matière à engager, distinct du suivi de production / livraison. */
export const MATERIAL_DEMAND_COMMERCIAL_STATUSES = ["PREVISION", "BON_COMMANDE", "SUR_STOCK"] as const;
export const MATERIAL_DEMAND_PRODUCTION_STATUS = "EN_INSTANCE";
export const MATERIAL_DEMAND_RULE = "Prévision, Bon de commande et Sur stock uniquement, à l’état non traité (EN_INSTANCE), sans production ni livraison déjà engagée sur la commande. Commandes en production, suspendues après démarrage, prêtes à livrer, livrées ou annulées exclues. Une commande partiellement traitée est exclue en entier, y compris ses autres articles.";
export const MATERIAL_DEMAND_CALCULATION = "Besoin à engager = quantité commandée des articles éligibles × 1 unité de chaque matière sélectionnée. Pas de déduction du stock matière disponible ou des achats : il ne s’agit pas d’un besoin net de stock.";
