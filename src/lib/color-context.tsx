"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch } from "./api";
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
  const [colors, setColors] = useState<AppColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDefaults = useCallback(() => {
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
    setLoading(false);
  }, []);

  const fetchColors = useCallback(async () => {
    // Ne pas appeler l'API si pas de token (pas connecté)
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("otp_token");
      if (!token) {
        loadDefaults();
        return;
      }
    }
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<{ colors: AppColor[] }>("/api/colors");
      setColors(data.colors);
    } catch {
      // Fallback silencieux vers les couleurs par défaut
      loadDefaults();
    } finally {
      setLoading(false);
    }
  }, [loadDefaults]);

  useEffect(() => {
    fetchColors();
    // Écouter les changements de token (login/logout)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "otp_token") fetchColors();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
      {children}
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
