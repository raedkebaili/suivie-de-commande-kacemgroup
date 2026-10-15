import { describe, expect, it } from "vitest";
import { orderModalSaveRights } from "../order-modal-permissions";

/**
 * Non-régression : le responsable technique (et la planification en modification)
 * doit toujours voir le bouton « Enregistrer ». Un commit précédent (rôle Gérant)
 * avait réduit ce bouton à `canEditOrderForm()`, ce qui le masquait pour ces rôles.
 */
describe("bouton Enregistrer de la fenêtre commande", () => {
  it("affiché pour le responsable technique en modification (spécifications techniques)", () => {
    const rights = orderModalSaveRights("technique", true);
    expect(rights.canSaveTechnical).toBe(true);
    expect(rights.showSaveButton).toBe(true);
  });

  it("affiché pour la planification en modification (usine, date de chargement, priorité)", () => {
    const rights = orderModalSaveRights("planification", true);
    expect(rights.canSavePlanning).toBe(true);
    expect(rights.showSaveButton).toBe(true);
  });

  it("affiché pour le commercial et le superadmin, en création comme en modification", () => {
    for (const role of ["commercial", "superadmin"]) {
      expect(orderModalSaveRights(role, false).showSaveButton).toBe(true);
      expect(orderModalSaveRights(role, true).showSaveButton).toBe(true);
    }
  });

  it("affiché pour la planification en création (commande Sur Stock uniquement)", () => {
    const rights = orderModalSaveRights("planification", false);
    expect(rights.canEditOrderForm).toBe(true);
    expect(rights.showSaveButton).toBe(true);
  });

  it("jamais affiché pour le technique en création (aucune commande à compléter)", () => {
    expect(orderModalSaveRights("technique", false).showSaveButton).toBe(false);
  });

  it("jamais affiché pour les rôles en consultation : gérant, accès agence, consultant prod, recouvrement", () => {
    for (const role of ["gerant", "acces_agence", "consultant_prod", "recouvrement"]) {
      for (const editing of [true, false]) {
        const rights = orderModalSaveRights(role, editing);
        expect(rights.showSaveButton, `${role} editing=${editing}`).toBe(false);
        expect(rights.canEditOrderForm).toBe(false);
        expect(rights.canSaveTechnical).toBe(false);
        expect(rights.canSavePlanning).toBe(false);
      }
    }
  });

  it("le bouton n'est jamais affiché sans droit d'enregistrement correspondant", () => {
    const roles = ["superadmin", "commercial", "technique", "planification", "consultant_prod", "recouvrement", "acces_agence", "gerant"];
    for (const role of roles) {
      for (const editing of [true, false]) {
        const r = orderModalSaveRights(role, editing);
        expect(r.showSaveButton).toBe(r.canEditOrderForm || r.canSaveTechnical || r.canSavePlanning);
      }
    }
  });
});
