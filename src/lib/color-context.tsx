"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch } from "./api";
import { useAuth } from "./auth-context";
import { 
  AppColor, 
  DEFAULT_COLORS, 
  getContrastTextColor, 
  lightenColor, 
  darkenColor 
} from "./color-utils";

type ColorContextType = {
  colors: AppColor[];
  loading: boolean;
  error: string | null;
  getColor: (key: string) => string;
  getTextColor: (key: string) => string;
  getBgStyle: (key: string) => React.CSSProperties;
  getBadgeStyle: (key: string) => React.CSSProperties;
  getRowStyle: (key: string) => React.CSSProperties;
  getCellStyle: (key: string) => React.CSSProperties;
  getModifiedCellStyle: () => React.CSSProperties;
  refreshColors: () => Promise<void>;
};

const ColorContext = createContext<ColorContextType>({
  colors: [],
  loading: true,
  error: null,
  getColor: () => "#808080",
  getTextColor: () => "#000000",
  getBgStyle: () => ({}),
  getBadgeStyle: () => ({}),
  getRowStyle: () => ({}),
  getCellStyle: () => ({}),
  getModifiedCellStyle: () => ({}),
  refreshColors: async () => {},
});

/**
 * Convertit une clé de statut vers une clé de couleur
 * Ex: "SUR_STOCK" reste "SUR_STOCK", "neutral" devient "VISUAL_NEUTRAL"
 */
function normalizeColorKey(key: string): string {
  // Mapping des états visuels
  const visualMapping: Record<string, string> = {
    "neutral": "VISUAL_NEUTRAL",
    "awaiting-delivery": "VISUAL_AWAITING",
    "delivered": "VISUAL_DELIVERED",
    "cancelled": "VISUAL_CANCELLED",
  };
  
  // Mapping des priorités
  const priorityMapping: Record<string, string> = {
    "NORMALE": "PRIORITY_NORMALE",
    "URGENTE": "PRIORITY_URGENTE",
    "TRES_URGENTE": "PRIORITY_TRES_URGENTE",
  };
  
  if (visualMapping[key]) return visualMapping[key];
  if (priorityMapping[key]) return priorityMapping[key];
  return key;
}

export function ColorProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [colors, setColors] = useState<AppColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Identifie l'utilisateur pour lequel les couleurs serveur ont été chargées.
  // Tant que cet identifiant n'est pas prêt, aucun module authentifié ne doit
  // être rendu avec les seules couleurs par défaut.
  const [loadedForUserId, setLoadedForUserId] = useState<number | null>(null);

  const loadDefaults = useCallback((authenticatedUserId: number | null = null) => {
    setColors(DEFAULT_COLORS.map((c, idx) => ({
      id: idx + 1,
      key: c.key,
      category: c.category,
      label: c.label,
      color: c.color,
      description: c.description,
      sortOrder: c.sortOrder,
      updatedAt: new Date().toISOString(),
      updatedByName: null,
    })));
    setLoadedForUserId(authenticatedUserId);
    setLoading(false);
  }, []);

  const fetchColors = useCallback(async () => {
    // Les couleurs sont publiques uniquement pour les utilisateurs de la
    // plateforme ; avant l'authentification, afficher les valeurs par défaut.
    if (!user) {
      loadDefaults();
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<{ colors: AppColor[] }>("/api/colors");
      setColors(data.colors);
      setLoadedForUserId(user.id);
    } catch {
      // Fallback silencieux vers les couleurs par défaut, sans bloquer l'accès.
      loadDefaults(user.id);
    } finally {
      setLoading(false);
    }
  }, [loadDefaults, user]);

  useEffect(() => {
    fetchColors();
  }, [fetchColors]);

  /**
   * Récupère la couleur HEX pour une clé donnée
   */
  const getColor = useCallback((key: string): string => {
    const normalizedKey = normalizeColorKey(key);
    const found = colors.find(c => c.key === normalizedKey);
    if (found) return found.color;
    
    // Fallback vers les couleurs par défaut
    const defaultColor = DEFAULT_COLORS.find(c => c.key === normalizedKey);
    return defaultColor?.color || "#808080";
  }, [colors]);

  /**
   * Récupère la couleur du texte (noir ou blanc) pour un contraste optimal
   */
  const getTextColor = useCallback((key: string): string => {
    return getContrastTextColor(getColor(key));
  }, [getColor]);

  /**
   * Génère un style CSS pour un fond avec la couleur
   */
  const getBgStyle = useCallback((key: string): React.CSSProperties => {
    const bgColor = getColor(key);
    const textColor = getContrastTextColor(bgColor);
    return {
      backgroundColor: bgColor,
      color: textColor,
    };
  }, [getColor]);

  /**
   * Génère un style CSS pour un badge (fond + bordure)
   */
  const getBadgeStyle = useCallback((key: string): React.CSSProperties => {
    const bgColor = getColor(key);
    const textColor = getContrastTextColor(bgColor);
    const borderColor = darkenColor(bgColor, 20);
    return {
      backgroundColor: bgColor,
      color: textColor,
      borderColor: borderColor,
      borderWidth: "1px",
      borderStyle: "solid",
    };
  }, [getColor]);

  /**
   * Génère un style CSS pour une ligne de tableau
   */
  const getRowStyle = useCallback((key: string): React.CSSProperties => {
    const bgColor = getColor(key);
    const textColor = getContrastTextColor(bgColor);
    const borderColor = darkenColor(bgColor, 15);
    return {
      backgroundColor: bgColor,
      color: textColor,
      borderColor: borderColor,
    };
  }, [getColor]);

  /**
   * Génère un style CSS pour une cellule de tableau
   */
  const getCellStyle = useCallback((key: string): React.CSSProperties => {
    const bgColor = getColor(key);
    const textColor = getContrastTextColor(bgColor);
    return {
      backgroundColor: bgColor,
      color: textColor,
    };
  }, [getColor]);

  /**
   * Génère un style CSS pour une cellule modifiée
   */
  const getModifiedCellStyle = useCallback((): React.CSSProperties => {
    const bgColor = getColor("FIELD_MODIFIED");
    const textColor = getContrastTextColor(bgColor);
    return {
      backgroundColor: bgColor,
      color: textColor,
      fontWeight: 600,
    };
  }, [getColor]);

  const colorsReady = !user || loadedForUserId === user.id;

  return (
    <ColorContext.Provider
      value={{
        colors,
        loading,
        error,
        getColor,
        getTextColor,
        getBgStyle,
        getBadgeStyle,
        getRowStyle,
        getCellStyle,
        getModifiedCellStyle,
        refreshColors: fetchColors,
      }}
    >
      {colorsReady ? children : (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
          <div className="flex flex-col items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <svg className="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24" aria-label="Chargement des couleurs">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Chargement de l&apos;apparence…</span>
          </div>
        </div>
      )}
    </ColorContext.Provider>
  );
}

export function useColors() {
  return useContext(ColorContext);
}

/**
 * Hook pour obtenir le style d'un statut spécifique
 */
export function useStatusStyle(status: string) {
  const { getBadgeStyle } = useColors();
  return getBadgeStyle(status);
}

/**
 * Hook pour obtenir le style d'une ligne selon son état visuel
 */
export function useRowStyle(visualState: string) {
  const { getRowStyle } = useColors();
  return getRowStyle(visualState);
}
