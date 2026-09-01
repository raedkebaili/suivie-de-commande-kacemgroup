/**
 * Utilitaires pour la gestion des couleurs
 * - Validation des codes HEX
 * - Calcul automatique de la couleur du texte (contraste)
 * - Conversion de couleurs
 */

// Couleurs par défaut de l'application
export const DEFAULT_COLORS: Array<{
  key: string;
  category: string;
  label: string;
  color: string;
  description: string;
  sortOrder: number;
}> = [
  // Statuts commerciaux
  { key: "SUR_STOCK", category: "commercial", label: "Sur Stock", color: "#06b6d4", description: "Commande disponible sur stock", sortOrder: 10 },
  { key: "BON_COMMANDE", category: "commercial", label: "Bon de Commande", color: "#3b82f6", description: "Commande confirmée par bon de commande", sortOrder: 20 },
  { key: "PREVISION", category: "commercial", label: "Prévision", color: "#f97316", description: "Prévision de commande", sortOrder: 30 },
  
  // Statuts production
  { key: "EN_INSTANCE", category: "production", label: "En Instance", color: "#8b5cf6", description: "En attente de traitement", sortOrder: 40 },
  { key: "EN_PRODUCTION", category: "production", label: "En Production", color: "#eab308", description: "En cours de production", sortOrder: 50 },
  { key: "LIVREE", category: "production", label: "Livrée", color: "#22c55e", description: "Commande entièrement livrée", sortOrder: 60 },
  { key: "ANNULEE", category: "production", label: "Annulée", color: "#FF2C2C", description: "Commande annulée", sortOrder: 70 },
  
  // États visuels des lignes de commande
  { key: "VISUAL_NEUTRAL", category: "visual", label: "État Neutre", color: "#FFFFFF", description: "Couleur de fond par défaut des lignes", sortOrder: 80 },
  { key: "VISUAL_AWAITING", category: "visual", label: "En Attente de Livraison", color: "#FFF700", description: "Production terminée, en attente de livraison", sortOrder: 90 },
  { key: "VISUAL_DELIVERED", category: "visual", label: "Livré (ligne)", color: "#86efac", description: "Article entièrement livré", sortOrder: 100 },
  { key: "VISUAL_CANCELLED", category: "visual", label: "Annulé (ligne)", color: "#FF2C2C", description: "Commande annulée", sortOrder: 110 },
  
  // Priorités
  { key: "PRIORITY_NORMALE", category: "priority", label: "Priorité Normale", color: "#d1d5db", description: "Priorité standard", sortOrder: 120 },
  { key: "PRIORITY_URGENTE", category: "priority", label: "Priorité Urgente", color: "#fca5a5", description: "Priorité haute", sortOrder: 130 },
  { key: "PRIORITY_TRES_URGENTE", category: "priority", label: "Très Urgente", color: "#ef4444", description: "Priorité maximale", sortOrder: 140 },
  
  // Modification tracking
  { key: "FIELD_MODIFIED", category: "tracking", label: "Champs Modifiés", color: "#9D00FF", description: "Couleur de fond pour les cellules modifiées", sortOrder: 150 },
  
  // Études photométriques
  { key: "ETUDE_PHOTOMETRIQUE", category: "etude", label: "Étude Photométrique", color: "#0ea5e9", description: "Couleur des lignes d'étude photométrique dans le tableau", sortOrder: 160 },
];

/**
 * Valide un code couleur HEX
 * @param hex Code couleur à valider (ex: "#FF5500" ou "FF5500")
 * @returns true si le code est valide
 */
export function isValidHexColor(hex: string): boolean {
  if (!hex) return false;
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  return /^[0-9A-Fa-f]{6}$/.test(clean) || /^[0-9A-Fa-f]{3}$/.test(clean);
}

/**
 * Normalise un code couleur HEX (ajoute # si absent, convertit en majuscules)
 * @param hex Code couleur
 * @returns Code normalisé avec # (ex: "#FF5500")
 */
export function normalizeHexColor(hex: string): string {
  if (!hex) return "#000000";
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  // Convertir les codes courts (3 caractères) en longs (6 caractères)
  const full = clean.length === 3 
    ? clean.split("").map(c => c + c).join("") 
    : clean;
  return `#${full.toUpperCase()}`;
}

/**
 * Convertit une couleur HEX en composantes RGB
 * @param hex Code couleur HEX
 * @returns Objet {r, g, b} avec valeurs 0-255
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  const full = clean.length === 3 
    ? clean.split("").map(c => c + c).join("") 
    : clean;
  
  const bigint = parseInt(full, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

/**
 * Calcule la luminosité relative d'une couleur (formule WCAG)
 * @param hex Code couleur HEX
 * @returns Luminosité relative (0-1)
 */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  
  // Conversion sRGB vers luminance relative (WCAG 2.1)
  const toLinear = (c: number) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Détermine si le texte doit être noir ou blanc pour un contraste optimal
 * selon les recommandations WCAG 2.1 (ratio de contraste minimum 4.5:1)
 * @param backgroundColor Code couleur HEX du fond
 * @returns "#000000" (noir) ou "#FFFFFF" (blanc)
 */
export function getContrastTextColor(backgroundColor: string): string {
  const luminance = getRelativeLuminance(backgroundColor);
  // Seuil basé sur la luminosité relative (0.179 est le point d'équilibre pour WCAG)
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}

/**
 * Calcule le ratio de contraste entre deux couleurs (WCAG 2.1)
 * @param color1 Première couleur HEX
 * @param color2 Deuxième couleur HEX
 * @returns Ratio de contraste (1-21)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Éclaircit une couleur HEX
 * @param hex Couleur de base
 * @param percent Pourcentage d'éclaircissement (0-100)
 * @returns Nouvelle couleur HEX
 */
export function lightenColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const factor = percent / 100;
  
  const newR = Math.min(255, Math.round(r + (255 - r) * factor));
  const newG = Math.min(255, Math.round(g + (255 - g) * factor));
  const newB = Math.min(255, Math.round(b + (255 - b) * factor));
  
  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`.toUpperCase();
}

/**
 * Assombrit une couleur HEX
 * @param hex Couleur de base
 * @param percent Pourcentage d'assombrissement (0-100)
 * @returns Nouvelle couleur HEX
 */
export function darkenColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - (percent / 100);
  
  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);
  
  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`.toUpperCase();
}

/**
 * Type pour une couleur de l'application
 */
export type AppColor = {
  id: number;
  key: string;
  category: string;
  label: string;
  color: string;
  description: string | null;
  sortOrder: number;
  updatedAt: string;
  updatedByName: string | null;
};

/**
 * Catégories de couleurs avec leurs labels
 */
export const COLOR_CATEGORIES: Record<string, string> = {
  commercial: "Statuts Commerciaux",
  production: "Statuts Production",
  visual: "États Visuels",
  priority: "Priorités",
  tracking: "Suivi des Modifications",
  etude: "Études Photométriques",
  recouvrement: "États de Recouvrement",
};
