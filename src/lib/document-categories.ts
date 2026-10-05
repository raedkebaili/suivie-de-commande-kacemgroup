/**
 * Catégories de documents contextuels — module partagé (client + serveur).
 * NE PAS importer "@/db" ici.
 *
 * La colonne drive_documents.category est un TEXTE libre côté base :
 * ajouter une entrée ici suffit à proposer une nouvelle catégorie,
 * sans aucune migration. Les valeurs déjà enregistrées restent lisibles
 * (fallback sur « Autre » à l'affichage).
 *
 * RÈGLE MÉTIER : ces documents vivent physiquement dans le module
 * « Stockage » (Google Drive, dossier racine) — cette table ne contient
 * que des associations logiques, jamais de duplication de fichier.
 */

export const DOCUMENT_CATEGORIES = [
  "CAHIER_DES_CHARGES",
  "ETUDE_PHOTOMETRIQUE",
  "TELEGESTION",
  "LISTE_CNODE",
  "LISTE_POINTS_LUMINEUX",
  "PLAN",
  "DOCUMENT_TECHNIQUE",
  "AUTRE",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  CAHIER_DES_CHARGES: "Cahier des charges",
  ETUDE_PHOTOMETRIQUE: "Étude photométrique",
  TELEGESTION: "Télégestion",
  LISTE_CNODE: "Liste C-Node",
  LISTE_POINTS_LUMINEUX: "Points lumineux",
  PLAN: "Plan",
  DOCUMENT_TECHNIQUE: "Document technique",
  AUTRE: "Autre",
};

export function documentCategoryLabel(category: string | null | undefined): string {
  if (!category) return DOCUMENT_CATEGORY_LABELS.AUTRE;
  return DOCUMENT_CATEGORY_LABELS[category] || DOCUMENT_CATEGORY_LABELS.AUTRE;
}

/** Formats acceptés pour l'ajout de documents contextuels (spec métier) */
export const DOCUMENT_ALLOWED_EXTENSIONS = [
  ".pdf", ".xls", ".xlsx", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".csv", ".txt",
] as const;

export function documentExtensionAllowed(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return DOCUMENT_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const DOCUMENT_MAX_SIZE = 50 * 1024 * 1024; // 50 Mo (identique au module Stockage)

/** Entités pouvant porter des documents */
export type DocumentEntityType = "order" | "study";

/** Forme d'une association telle que renvoyée par l'API */
export type LinkedDocument = {
  id: number;
  orderId: number | null;
  studyId: number | null;
  driveFileId: string;
  driveFolderId: string | null;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  webViewLink: string | null;
  category: string;
  uploadedById: number | null;
  uploadedByName: string;
  createdAt: string;
};
