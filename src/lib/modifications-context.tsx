"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { apiFetch } from "./api";

/**
 * Structure d'un log de modification
 */
export type ModificationLog = {
  id: number;
  orderId: number;
  userId: number | null;
  username: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

/**
 * Mapping des modifications par article
 * Clé: itemId, Valeur: ensemble de champs modifiés
 */
export type ItemModifications = Map<number, Set<string>>;

/**
 * Mapping des modifications par commande
 * Clé: orderId, Valeur: { orderFields: Set<string>, items: ItemModifications }
 */
export type OrderModifications = {
  orderFields: Set<string>;
  items: ItemModifications;
};

type ModificationsContextType = {
  /** Cache des modifications par orderId */
  modificationsCache: Map<number, OrderModifications>;
  /** Charge les modifications pour une commande */
  loadOrderModifications: (orderId: number) => Promise<OrderModifications>;
  /** Vérifie si un champ d'article a été modifié */
  isItemFieldModified: (orderId: number, itemId: number, field: string) => boolean;
  /** Vérifie si un champ de commande a été modifié */
  isOrderFieldModified: (orderId: number, field: string) => boolean;
  /** Force le rechargement des modifications */
  refreshOrderModifications: (orderId: number) => Promise<void>;
  /** Efface le cache */
  clearCache: () => void;
};

const ModificationsContext = createContext<ModificationsContextType>({
  modificationsCache: new Map(),
  loadOrderModifications: async () => ({ orderFields: new Set(), items: new Map() }),
  isItemFieldModified: () => false,
  isOrderFieldModified: () => false,
  refreshOrderModifications: async () => {},
  clearCache: () => {},
});

/**
 * Parse le champ de modification pour extraire l'articleName et le type de champ
 * Exemples de champs:
 * - "Article supprimé" -> orderField
 * - "Article ajouté" -> orderField  
 * - "Qté NETLUX 150W" -> { articleName: "NETLUX 150W", fieldType: "quantity" }
 * - "Note NETLUX 150W" -> { articleName: "NETLUX 150W", fieldType: "note" }
 * - "Composant ajouté - NETLUX 150W" -> { articleName: "NETLUX 150W", fieldType: "technicalComponents" }
 * - "Article renommé" -> { oldValue: ancien nom, newValue: nouveau nom, fieldType: "articleName" }
 */
function parseModificationField(field: string, oldValue: string | null, newValue: string | null): {
  isOrderLevel: boolean;
  articleName: string | null;
  fieldType: string;
} {
  // Champs au niveau commande
  const orderLevelFields = [
    "N° Commande", "Date", "Client", "Agence", "Affaire", "État commercial",
    "Priorité", "État", "Motif", "Cause annulation"
  ];
  
  for (const orderField of orderLevelFields) {
    if (field === orderField || field.startsWith(orderField)) {
      return { isOrderLevel: true, articleName: null, fieldType: field };
    }
  }

  // Article supprimé/ajouté
  if (field === "Article supprimé") {
    return { isOrderLevel: false, articleName: oldValue, fieldType: "deleted" };
  }
  if (field === "Article ajouté") {
    return { isOrderLevel: false, articleName: newValue, fieldType: "added" };
  }
  
  // Article renommé
  if (field === "Article renommé") {
    // L'article a changé de nom: oldValue -> newValue
    // On marque le nouveau nom comme modifié
    return { isOrderLevel: false, articleName: newValue, fieldType: "articleName" };
  }
  
  // Quantité d'un article: "Qté ARTICLE_NAME"
  if (field.startsWith("Qté ")) {
    const articleName = field.substring(4);
    return { isOrderLevel: false, articleName, fieldType: "quantity" };
  }
  
  // Note d'un article: "Note ARTICLE_NAME"
  if (field.startsWith("Note ")) {
    const articleName = field.substring(5);
    return { isOrderLevel: false, articleName, fieldType: "note" };
  }
  
  // Besoin client: "Besoin ARTICLE_NAME"
  if (field.startsWith("Besoin ")) {
    const articleName = field.substring(7);
    return { isOrderLevel: false, articleName, fieldType: "clientSpec" };
  }
  
  // Composant ajouté/supprimé: "Composant ajouté - ARTICLE_NAME" ou "Composant supprimé - ARTICLE_NAME"
  if (field.startsWith("Composant ajouté - ") || field.startsWith("Composant supprimé - ")) {
    const articleName = field.includes(" - ") ? field.split(" - ").slice(1).join(" - ") : null;
    return { isOrderLevel: false, articleName, fieldType: "technicalComponents" };
  }
  
  // Par défaut, considérer comme niveau commande
  return { isOrderLevel: true, articleName: null, fieldType: field };
}

export function ModificationsProvider({ children }: { children: React.ReactNode }) {
  const [modificationsCache, setModificationsCache] = useState<Map<number, OrderModifications>>(new Map());

  /**
   * Charge et parse les modifications pour une commande
   */
  const loadOrderModifications = useCallback(async (orderId: number): Promise<OrderModifications> => {
    // Vérifier le cache
    const cached = modificationsCache.get(orderId);
    if (cached) return cached;

    try {
      const data = await apiFetch<{ logs: ModificationLog[] }>(`/api/order-modifications/${orderId}`);
      
      const orderFields = new Set<string>();
      const items = new Map<number, Set<string>>();
      
      // Map articleName -> itemId (sera remplie plus tard par le composant)
      const articleNameToFields = new Map<string, Set<string>>();
      
      for (const log of data.logs) {
        const parsed = parseModificationField(log.field, log.oldValue, log.newValue);
        
        if (parsed.isOrderLevel) {
          orderFields.add(parsed.fieldType);
        } else if (parsed.articleName) {
          // Stocker par nom d'article pour l'instant
          if (!articleNameToFields.has(parsed.articleName)) {
            articleNameToFields.set(parsed.articleName, new Set());
          }
          articleNameToFields.get(parsed.articleName)!.add(parsed.fieldType);
        }
      }
      
      const result: OrderModifications = {
        orderFields,
        items,
        // Ajout d'une propriété auxiliaire pour mapper par nom d'article
        // @ts-expect-error - propriété auxiliaire
        _byArticleName: articleNameToFields,
      };
      
      // Mettre à jour le cache
      setModificationsCache(prev => new Map(prev).set(orderId, result));
      
      return result;
    } catch (error) {
      console.error("Erreur chargement modifications:", error);
      return { orderFields: new Set(), items: new Map() };
    }
  }, [modificationsCache]);

  /**
   * Vérifie si un champ d'article a été modifié
   */
  const isItemFieldModified = useCallback((orderId: number, itemId: number, field: string): boolean => {
    const mods = modificationsCache.get(orderId);
    if (!mods) return false;
    
    const itemMods = mods.items.get(itemId);
    return itemMods?.has(field) || false;
  }, [modificationsCache]);

  /**
   * Vérifie si un champ de commande a été modifié
   */
  const isOrderFieldModified = useCallback((orderId: number, field: string): boolean => {
    const mods = modificationsCache.get(orderId);
    if (!mods) return false;
    return mods.orderFields.has(field);
  }, [modificationsCache]);

  /**
   * Force le rechargement
   */
  const refreshOrderModifications = useCallback(async (orderId: number): Promise<void> => {
    setModificationsCache(prev => {
      const next = new Map(prev);
      next.delete(orderId);
      return next;
    });
    await loadOrderModifications(orderId);
  }, [loadOrderModifications]);

  /**
   * Efface le cache
   */
  const clearCache = useCallback(() => {
    setModificationsCache(new Map());
  }, []);

  return (
    <ModificationsContext.Provider
      value={{
        modificationsCache,
        loadOrderModifications,
        isItemFieldModified,
        isOrderFieldModified,
        refreshOrderModifications,
        clearCache,
      }}
    >
      {children}
    </ModificationsContext.Provider>
  );
}

export function useModifications() {
  return useContext(ModificationsContext);
}

/**
 * Hook pour obtenir les champs modifiés d'une commande avec ses articles
 */
export function useOrderModifications(orderId: number | undefined, articleNames: string[]) {
  const { modificationsCache, loadOrderModifications } = useModifications();
  const [loaded, setLoaded] = useState(false);

  // Charger les modifications si pas en cache
  React.useEffect(() => {
    if (!orderId) return;
    if (!modificationsCache.has(orderId)) {
      loadOrderModifications(orderId).then(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [orderId, modificationsCache, loadOrderModifications]);

  const mods = orderId ? modificationsCache.get(orderId) : null;
  
  /**
   * Vérifie si un champ d'article a été modifié (par nom d'article)
   */
  const isFieldModified = useCallback((articleName: string, field: string): boolean => {
    if (!mods) return false;
    // @ts-expect-error - propriété auxiliaire
    const byName = mods._byArticleName as Map<string, Set<string>> | undefined;
    if (!byName) return false;
    const fields = byName.get(articleName);
    return fields?.has(field) || false;
  }, [mods]);

  /**
   * Obtient tous les champs modifiés pour un article
   */
  const getModifiedFields = useCallback((articleName: string): Set<string> => {
    if (!mods) return new Set();
    // @ts-expect-error - propriété auxiliaire
    const byName = mods._byArticleName as Map<string, Set<string>> | undefined;
    if (!byName) return new Set();
    return byName.get(articleName) || new Set();
  }, [mods]);

  return {
    loaded,
    orderFields: mods?.orderFields || new Set<string>(),
    isFieldModified,
    getModifiedFields,
  };
}
