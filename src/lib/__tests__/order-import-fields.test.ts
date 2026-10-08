import { describe, expect, it } from "vitest";
import { ORDER_IMPORT_HEADERS, suggestOrderImportMapping } from "../order-import-fields";

describe("modèle et mappage import commandes", () => {
  it("reprend les colonnes du modèle export/archive commandes", () => {
    expect(ORDER_IMPORT_HEADERS).toContain("N° Commande");
    expect(ORDER_IMPORT_HEADERS).toContain("Client");
    expect(ORDER_IMPORT_HEADERS).toContain("Article");
    expect(ORDER_IMPORT_HEADERS).toContain("Reste à livrer");
  });

  it("reconnaît les variantes historiques avec accents et pluriels", () => {
    const mapping = suggestOrderImportMapping([
      "Commande", "Date", "Clients", "Agence", "Affaire", "Etat",
      "Désignation", "Quantité", "Reste livraison", "Commentaire", "PCB", "Driver", "Classe",
    ]);
    expect(mapping.orderNumber).toBe("Commande");
    expect(mapping.client).toBe("Clients");
    expect(mapping.articleName).toBe("Désignation");
    expect(mapping.quantity).toBe("Quantité");
    expect(mapping.remainingQty).toBe("Reste livraison");
    expect(mapping.note).toBe("Commentaire");
    expect(mapping.pcb).toBe("PCB");
    expect(mapping.driver).toBe("Driver");
    expect(mapping.electricalClass).toBe("Classe");
    expect(mapping.productionStatus).toBe("Etat");
  });

  it("reconnaît les intitulés du modèle historique fourni", () => {
    const mapping = suggestOrderImportMapping([
      "N° Commande", "Priorité", "Articles", "Date commande", "quantité", "Clients", "Agence",
      "PCB", "Temp. Coule", "lentilles", "Driver", "classe", "Accesoires", "Nbre Profilet",
      "Spécifications Techniques", "NOTE", "Unité de production", "Date prévu de chargement",
      "quantité livré", "date de livraison", "reste a livre",
    ]);
    expect(mapping.orderNumber).toBe("N° Commande");
    expect(mapping.articleName).toBe("Articles");
    expect(mapping.quantity).toBe("quantité");
    expect(mapping.colorTemperature).toBe("Temp. Coule");
    expect(mapping.lens).toBe("lentilles");
    expect(mapping.accessories).toBe("Accesoires");
    expect(mapping.otherTechSpecs).toBe("Spécifications Techniques");
    expect(mapping.plannedLoadingDate).toBe("Date prévu de chargement");
    expect(mapping.deliveredQty).toBe("quantité livré");
    expect(mapping.deliveryDate).toBe("date de livraison");
    expect(mapping.remainingQty).toBe("reste a livre");
  });
});
