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
      "Désignation", "Quantité", "Reste livraison", "Commentaire",
    ]);
    expect(mapping.orderNumber).toBe("Commande");
    expect(mapping.client).toBe("Clients");
    expect(mapping.articleName).toBe("Désignation");
    expect(mapping.quantity).toBe("Quantité");
    expect(mapping.remainingQty).toBe("Reste livraison");
    expect(mapping.note).toBe("Commentaire");
    expect(mapping.productionStatus).toBe("Etat");
  });
});
