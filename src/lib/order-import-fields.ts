export type OrderImportField = {
  key: string;
  label: string;
  required?: boolean;
  importable?: boolean;
  aliases: string[];
};

/**
 * Colonnes du modèle commandes : elles reprennent les intitulés produits par
 * /api/orders/export et utilisés par l'archive historique. Les champs marqués
 * importable:false sont conservés dans le modèle pour fidélité mais ne sont
 * pas écrasés par un ancien fichier (traçabilité de la plateforme).
 */
export const ORDER_IMPORT_FIELDS: OrderImportField[] = [
  { key: "orderNumber", label: "N° Commande", aliases: ["n commande", "n° commande", "numero commande", "num commande", "commande", "n commande"] },
  { key: "orderDate", label: "Date Commande", aliases: ["date commande", "date", "date de commande"] },
  { key: "priority", label: "Priorité", aliases: ["priorite", "priorité", "urgence"] },
  { key: "client", label: "Client", required: true, aliases: ["client", "clients", "nom client", "raison sociale"] },
  { key: "agency", label: "Agence", required: true, aliases: ["agence", "agences", "code agence"] },
  { key: "affaire", label: "Affaire", aliases: ["affaire", "affaires", "projet", "chantier"] },
  { key: "commercialStatus", label: "État Commercial", aliases: ["etat commercial", "état commercial", "statut commercial", "status commercial"] },
  { key: "productionStatus", label: "État Production", aliases: ["etat production", "état production", "statut production", "status production", "etat", "état", "statut"] },
  { key: "createdBy", label: "Créé par", importable: false, aliases: ["creé par", "cree par", "créé par"] },
  { key: "techCompleted", label: "Tech. Validé", importable: false, aliases: ["tech valide", "technique valide", "tech validé"] },
  { key: "planifCompleted", label: "Planif. Validé", importable: false, aliases: ["planif valide", "planification valide"] },
  { key: "updatedBy", label: "Modifié par", importable: false, aliases: ["modifie par", "modifié par"] },
  { key: "updatedAt", label: "Modifié le", importable: false, aliases: ["modifie le", "modifié le"] },
  { key: "cancelReason", label: "Cause annulation", aliases: ["cause annulation", "motif annulation", "raison annulation"] },
  { key: "cancelledBy", label: "Annulé par", importable: false, aliases: ["annule par", "annulé par"] },
  { key: "cancelledAt", label: "Annulé le", importable: false, aliases: ["annule le", "annulé le"] },
  { key: "articleName", label: "Article", required: true, aliases: ["article", "designation", "désignation", "produit", "libelle", "libellé"] },
  { key: "quantity", label: "Qté Commandée", required: true, aliases: ["qte commandee", "qté commandée", "quantite commandee", "quantité commandée", "quantite", "quantité", "qte", "qté"] },
  { key: "clientSpec", label: "Besoin Client", aliases: ["besoin client", "besoin", "specification client", "spécification client"] },
  { key: "productionUnit", label: "Unité Production", aliases: ["unite production", "unité production", "unite", "unité", "usine"] },
  { key: "plannedLoadingDate", label: "Date Chargement", aliases: ["date chargement", "date de chargement", "chargement"] },
  { key: "producedQty", label: "Qté Produite", aliases: ["qte produite", "qté produite", "quantite produite", "quantité produite", "produit"] },
  { key: "deliveredQty", label: "Qté Livrée", aliases: ["qte livree", "qté livrée", "quantite livree", "quantité livrée", "livre", "livré"] },
  { key: "remainingQty", label: "Reste à livrer", aliases: ["reste a livrer", "reste à livrer", "reste livraison", "reste"] },
  { key: "deliveryDate", label: "Date livraison", aliases: ["date livraison", "date livree", "date livrée"] },
  { key: "pcb", label: "PCB", aliases: ["pcb"] },
  { key: "pcbBy", label: "PCB par", importable: false, aliases: ["pcb par"] },
  { key: "pcbAt", label: "PCB le", importable: false, aliases: ["pcb le"] },
  { key: "colorTemperature", label: "Temp. Couleur", aliases: ["temp couleur", "temperature couleur", "température couleur", "couleur"] },
  { key: "colorTempBy", label: "TC par", importable: false, aliases: ["tc par", "temperature couleur par"] },
  { key: "colorTempAt", label: "TC le", importable: false, aliases: ["tc le", "temperature couleur le"] },
  { key: "lens", label: "Lentille", aliases: ["lentille", "optique"] },
  { key: "lensBy", label: "Lentille par", importable: false, aliases: ["lentille par"] },
  { key: "lensAt", label: "Lentille le", importable: false, aliases: ["lentille le"] },
  { key: "driver", label: "Driver", aliases: ["driver", "alimentation"] },
  { key: "driverBy", label: "Driver par", importable: false, aliases: ["driver par"] },
  { key: "driverAt", label: "Driver le", importable: false, aliases: ["driver le"] },
  { key: "electricalClass", label: "Classe Élec.", aliases: ["classe elec", "classe élec", "classe electrique", "classe électrique"] },
  { key: "elecClassBy", label: "CE par", importable: false, aliases: ["ce par", "classe electrique par"] },
  { key: "elecClassAt", label: "CE le", importable: false, aliases: ["ce le", "classe electrique le"] },
  { key: "accessories", label: "Accessoires", aliases: ["accessoires", "accessory"] },
  { key: "accessoriesBy", label: "Acc par", importable: false, aliases: ["acc par", "accessoires par"] },
  { key: "accessoriesAt", label: "Acc le", importable: false, aliases: ["acc le", "accessoires le"] },
  { key: "otherTechSpecs", label: "Autres Spécs", aliases: ["autres specs", "autres spécs", "autres specifications", "autres spécifications", "specifications techniques", "spécifications techniques"] },
  { key: "otsBy", label: "OTS par", importable: false, aliases: ["ots par"] },
  { key: "otsAt", label: "OTS le", importable: false, aliases: ["ots le"] },
  { key: "technicalComponents", label: "Composants Techniques", importable: false, aliases: ["composants techniques", "composants"] },
  { key: "telegestionAccessories", label: "Accessoires Télégestion", importable: false, aliases: ["accessoires telegestion", "accessoires télégestion"] },
  { key: "note", label: "Note", aliases: ["note", "commentaire", "observations", "observation"] },
  { key: "unitPrice", label: "Prix unitaire", aliases: ["prix unitaire", "prix", "pu"] },
  { key: "reference", label: "Référence article", importable: true, aliases: ["reference article", "référence article", "reference", "référence", "ref"] },
  { key: "description", label: "Description", importable: true, aliases: ["description", "details", "détails"] },
];

export const ORDER_IMPORT_HEADERS = ORDER_IMPORT_FIELDS
  .filter((field) => field.importable !== false || !["reference", "description"].includes(field.key))
  .map((field) => field.label);

export function normalizeImportHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function headerMatches(header: string, alias: string): boolean {
  const h = normalizeImportHeader(header);
  const a = normalizeImportHeader(alias);
  return h === a || (a.length >= 5 && h.length >= 5 && (h.includes(a) || a.includes(h)));
}

export function suggestOrderImportMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const field of ORDER_IMPORT_FIELDS.filter((candidate) => candidate.importable !== false)) {
    const exact = headers.find((header) => !used.has(header) && normalizeImportHeader(header) === normalizeImportHeader(field.label));
    const fuzzy = headers.find((header) => !used.has(header) && field.aliases.some((alias) => headerMatches(header, alias)));
    const selected = exact || fuzzy;
    if (selected) {
      mapping[field.key] = selected;
      used.add(selected);
    }
  }
  return mapping;
}
