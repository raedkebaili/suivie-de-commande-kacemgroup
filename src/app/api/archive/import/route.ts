export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { archiveRows, archiveSheets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { detectClientsColumnIndex, detectResteColumnIndex } from "@/lib/archive-constants";
import { ensureArchiveColors } from "@/lib/archive";

// ── Détection du véritable header du tableau (module Archive uniquement) ──
// Mots-clés présents dans la ligne d'en-tête réelle du fichier « Suivi commandes ».
const HEADER_KEYWORDS = [
  "priorite", "commande", "date", "qte", "client", "agence", "article",
  "pcb", "couleur", "lentille", "driver", "classe", "accessoire", "profilet",
  "specification", "technique", "note", "unite", "production", "chargement",
  "reste", "livraison", "prix", "affaire",
];

const normCell = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Score d'une ligne « candidate » comme en-tête : nb de mots-clés + densité de remplissage */
function headerScore(row: string[]): number {
  if (!row || row.length === 0) return -1;
  let matches = 0;
  let nonEmpty = 0;
  for (const cell of row) {
    const c = normCell(String(cell ?? ""));
    if (c === "") continue;
    nonEmpty++;
    if (HEADER_KEYWORDS.some((k) => c.includes(k))) matches++;
  }
  if (matches === 0) return -1;
  return matches * 100 + nonEmpty;
}

/** Chaîne vide si null/absent, sinon le texte conservé tel quel */
const cellText = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** Date Excel DateObj → "DD/MM/YYYY". Une cellule vide reste vide (jamais interprétée). */
function formatDateCell(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${v.getFullYear()}`;
  }
  if (typeof v === "number" && v > 59 && v < 100000) {
    // Serial date Excel : jours depuis le 1899-12-30 (formule standard, pas de libre choix)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2200) {
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}/${d.getUTCFullYear()}`;
    }
    return String(v);
  }
  return cellText(v);
}

/** true si la valeur « ressemble » à une date Excel (DateObj ou serial), false sinon */
function isDateLike(v: unknown): boolean {
  return (v instanceof Date && !isNaN(v.getTime())) || (typeof v === "number" && v > 59 && v < 100000);
}

/** Index de la vraie ligne d'en-tête, ou -1 si aucune ligne candidate valide */
function detectHeaderIndex(matrix: unknown[][]): number {
  const scanLimit = Math.min(40, matrix.length);
  let best = -1;
  let bestScore = 0.5; // seuil minimal : au moins un mot-clé présent
  for (let i = 0; i < scanLimit; i++) {
    const score = headerScore(((matrix[i] || []) as unknown[]).map(cellText));
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/**
 * POST /api/archive/import  (multipart: file)
 * Importe un classeur Excel d'archive — SUPERADMIN UNIQUEMENT.
 *
 * Garanties demandées :
 *  - toutes les feuilles sont importées (une feuille = une période) ;
 *  - l'ordre des feuilles, des colonnes et des lignes est conservé ;
 *  - les cellules vides sont conservées (chaîne vide, jamais supprimées) ;
 *  - les valeurs textuelles sont conservées telles quelles (raw: false) ;
 *  - les lignes complémentaires situées avant l'en-tête sont conservées
 *    dans le champ "preamble" de la feuille ;
 *  - le nom de la feuille d'origine et le fichier source sont conservés.
 *
 * L'archive est stockée dans des tables dédiées : AUCUN impact sur les
 * commandes actives (orders / order_items).
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") {
    return NextResponse.json({ error: "Import réservé à l'administrateur" }, { status: 403 });
  }

  try {
    const fd = await request.formData();
    const file = fd.get("file") as File | null;
    const replace = String(fd.get("replace") || "") === "1";
    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });

    const MAX_BYTES = 25 * 1024 * 1024; // garde-fou mémoire
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux (25 Mo maximum)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = await import("xlsx");
    // cellDates: true → les dates Excel deviennent de vrais objets Date, ce qui
    // permet de les re-formater correctement en DD/MM/YYYY (module Archive).
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });

    await ensureArchiveColors();

    const imported: { sheet: string; rows: number }[] = [];
    let totalRows = 0;

    for (let s = 0; s < wb.SheetNames.length; s++) {
      const sheetName = wb.SheetNames[s];
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      // header: 1 + defval: "" → matrice brute, cellules vides préservées.
      // raw: true (couplé à cellDates:true) → les dates deviennent de vrais
      // objets Date, re-formatés ensuite en DD/MM/YYYY par formatDateCell.
      const matrix = XLSX.utils.sheet_to_json<string[]>(ws, {
        header: 1,
        defval: "",
        blankrows: true,
        raw: true,
      }) as unknown as unknown[][];
      if (matrix.length === 0) continue;

      // ── Vraie ligne d'en-tête : meilleure ligne candidate par mots-clés ──
      // (corrige l'ancien comportement qui prenait la 1re ligne de données
      // comme header, et ne garde JAMAIS une commande comme header).
      const headerIdx = detectHeaderIndex(matrix);
      if (headerIdx < 0) continue; // pas de tableau exploitable

      const rawHeader = (matrix[headerIdx] || []).map((c) => cellText(c).trim());

      // ── Largeur réelle du tableau ──
      // Dernière colonne RÉELLEMENT utilisée (en-tête nommée OU contenant une
      // donnée). Les colonnes Excel techniquement présentes mais vides (jusqu'à
      // la colonne 128+) sont ignorées : « État » vient juste après la dernière
      // colonne utile. La largeur dépend donc de CHAQUE feuille.
      let lastUsed = -1;
      for (let c = rawHeader.length - 1; c >= 0; c--) {
        if ((rawHeader[c] || "") !== "") { lastUsed = c; break; }
      }
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const row = matrix[i] || [];
        for (let c = row.length - 1; c >= 0; c--) {
          if (cellText(row[c]).trim() !== "") { lastUsed = Math.max(lastUsed, c); break; }
        }
      }
      const width = lastUsed + 1;
      if (width <= 0) continue;

      const columns: string[] = [];
      for (let c = 0; c < width; c++) {
        const label = rawHeader[c] ?? "";
        columns.push(label !== "" ? label : `Colonne ${c + 1}`);
      }

      // Détection des colonnes dates (nommées « date … ») pour formatage DD/MM/YYYY
      const dateColumnIdx: number[] = [];
      columns.forEach((col, c) => {
        if (normCell(col).includes("date")) dateColumnIdx.push(c);
      });

      // Lignes complémentaires situées AVANT l'en-tête (titres, périodes, etc.)
      const preamble = matrix.slice(0, headerIdx).map((r) =>
        (r || []).slice(0, width).map((c) => (isDateLike(c) ? formatDateCell(c) : cellText(c)).trim()),
      );

      // Lignes de données : cellules vides conservées, ordre préservé.
      // Les lignes entièrement vides sont ignorées (bruit de fin de feuille).
      const dataRows: { rowIndex: number; cells: string[] }[] = [];
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const raw = matrix[i] || [];
        const cells: string[] = [];
        for (let c = 0; c < width; c++) {
          const v = raw[c];
          cells.push(dateColumnIdx.includes(c) ? formatDateCell(v).trim() : cellText(v).trim());
        }
        if (cells.every((cv) => cv === "")) continue;
        dataRows.push({ rowIndex: dataRows.length, cells });
      }
      if (dataRows.length === 0 && preamble.length === 0) continue;

      const resteColumnIndex = detectResteColumnIndex(columns);
      const clientsColumnIndex = detectClientsColumnIndex(columns);

      // Nom unique de feuille : "<feuille>" ou "<feuille> (2)" si déjà présent,
      // sauf si l'administrateur a demandé le remplacement.
      let finalName = sheetName;
      const [existing] = await db.select().from(archiveSheets).where(eq(archiveSheets.name, finalName)).limit(1);
      if (existing) {
        if (replace) {
          await db.delete(archiveRows).where(eq(archiveRows.sheetId, existing.id));
          await db.delete(archiveSheets).where(eq(archiveSheets.id, existing.id));
        } else {
          let n = 2;
          for (;;) {
            const candidate = `${sheetName} (${n})`;
            const [dup] = await db.select({ id: archiveSheets.id }).from(archiveSheets).where(eq(archiveSheets.name, candidate)).limit(1);
            if (!dup) { finalName = candidate; break; }
            n++;
          }
        }
      }

      const [createdSheet] = await db.insert(archiveSheets).values({
        name: finalName,
        sourceFilename: file.name,
        sheetIndex: s,
        columns: JSON.stringify(columns),
        preamble: preamble.length > 0 ? JSON.stringify(preamble) : null,
        resteColumnIndex,
        clientsColumnIndex,
        rowCount: dataRows.length,
        importedById: user.id,
        importedByName: user.fullName,
      }).returning();

      // Insertion par lots (même approche que la restauration de sauvegarde)
      const chunkSize = 200;
      for (let i = 0; i < dataRows.length; i += chunkSize) {
        const chunk = dataRows.slice(i, i + chunkSize).map((r) => ({
          sheetId: createdSheet.id,
          rowIndex: r.rowIndex,
          cells: JSON.stringify(r.cells),
        }));
        if (chunk.length > 0) await db.insert(archiveRows).values(chunk);
      }

      imported.push({ sheet: finalName, rows: dataRows.length });
      totalRows += dataRows.length;
    }

    if (imported.length === 0) {
      return NextResponse.json({ error: "Aucune feuille exploitable dans ce fichier" }, { status: 400 });
    }

    await logActivity(user.id, user.username, "IMPORT_ARCHIVE",
      `Archive importée (${file.name}): ${imported.length} feuille(s), ${totalRows} ligne(s)`);

    return NextResponse.json({ ok: true, sheets: imported, totalRows }, { status: 201 });
  } catch (error) {
    console.error("Erreur import archive:", error);
    return NextResponse.json({ error: "Erreur lors de l'import: " + String(error) }, { status: 500 });
  }
}
