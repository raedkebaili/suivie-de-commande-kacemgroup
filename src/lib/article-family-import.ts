/**
 * Import Excel du catalogue des familles (partagé serveur + tests).
 * NE PAS importer "@/db" ici : lecture pure, aucune écriture.
 *
 * Colonnes reconnues (insensibles à la casse, aux accents et aux espaces) :
 *   FAMILLE          (obligatoire)  → catégorie, ex. « PROJECTEUR LED »
 *   SOUS FAMILLE     (obligatoire)  → famille commerciale, ex. « NETLUX »
 *   VARIANTE         (facultatif)   → ex. « 2.0 », « I », « PRO », « + », « 4m »
 *   DESIGNATION      (facultatif)   → désignation EXACTE d'un article à affecter à cette famille
 *
 * Règle : si une ligne contient une erreur, l'import entier est refusé (aucune écriture partielle).
 */
import { catalogLabel, cleanCatalogText, validateCatalogEntry, type ArticleFamilyCatalogEntry } from "./article-family-catalog";

export const FAMILY_IMPORT_MAX_ROWS = 2000;

export type FamilyImportLine = {
  rowNumber: number;
  entry: ArticleFamilyCatalogEntry;
  /** Désignation exacte à affecter, ou null si la ligne ne sert qu'à créer la famille */
  designation: string | null;
};

export type FamilyImportParse = { lines: FamilyImportLine[]; errors: string[] };

/** Normalisation d'un en-tête : minuscules, sans accents, sans séparateurs */
export function normalizeImportHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function valueOf(row: Record<string, unknown>, names: string[]): string {
  const wanted = new Set(names.map(normalizeImportHeader));
  const entry = Object.entries(row).find(([key]) => wanted.has(normalizeImportHeader(key)));
  return entry ? cleanCatalogText(entry[1]) : "";
}

export function parseFamilyImportRows(rows: Record<string, unknown>[]): FamilyImportParse {
  const lines: FamilyImportLine[] = [];
  const errors: string[] = [];
  const seenLabels = new Map<string, number>();
  const seenDesignations = new Map<string, number>();

  if (rows.length > FAMILY_IMPORT_MAX_ROWS) {
    return { lines, errors: [`Le fichier dépasse la limite de ${FAMILY_IMPORT_MAX_ROWS} lignes`] };
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // ligne 1 = en-têtes
    const rowErrors: string[] = [];
    const checked = validateCatalogEntry({
      category: valueOf(row, ["FAMILLE", "famille", "catégorie", "categorie"]),
      subFamily: valueOf(row, ["SOUS FAMILLE", "sous-famille", "sousfamille"]),
      variant: valueOf(row, ["VARIANTE", "variante"]),
    });
    if (!checked.ok) rowErrors.push(checked.error);

    const designation = valueOf(row, ["DESIGNATION", "désignation", "designation", "article"]) || null;

    if (checked.ok) {
      const label = catalogLabel(checked.value);
      const labelKey = label.toLowerCase();
      // Deux lignes du même fichier ne peuvent pas définir le même libellé (sinon fusion)
      const previous = seenLabels.get(labelKey);
      if (previous !== undefined && previous !== rowNumber) {
        rowErrors.push(`libellé « ${label} » déjà présent à la ligne ${previous}`);
      } else {
        seenLabels.set(labelKey, rowNumber);
      }
    }

    if (designation) {
      const previous = seenDesignations.get(designation);
      if (previous !== undefined) rowErrors.push(`désignation « ${designation} » déjà présente à la ligne ${previous}`);
      else seenDesignations.set(designation, rowNumber);
    }

    if (rowErrors.length > 0) {
      errors.push(`Ligne ${rowNumber} : ${rowErrors.join(" ; ")}`);
    } else if (checked.ok) {
      lines.push({ rowNumber, entry: checked.value, designation });
    }
  });

  if (lines.length === 0 && errors.length === 0) errors.push("Aucune ligne exploitable trouvée");
  // Règle « tout ou rien » : une seule erreur bloque l'import entier
  if (errors.length > 0) return { lines: [], errors };
  return { lines, errors };
}
