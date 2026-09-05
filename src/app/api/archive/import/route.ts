export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { archiveRows, archiveSheets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { detectResteColumnIndex } from "@/lib/archive-constants";
import { ensureArchiveColors } from "@/lib/archive";

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
    // raw: false → les valeurs sont lues telles qu'affichées (texte conservé)
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });

    await ensureArchiveColors();

    const imported: { sheet: string; rows: number }[] = [];
    let totalRows = 0;

    for (let s = 0; s < wb.SheetNames.length; s++) {
      const sheetName = wb.SheetNames[s];
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      // header: 1 + defval: "" → matrice brute, cellules vides préservées
      const matrix = XLSX.utils.sheet_to_json<string[]>(ws, {
        header: 1,
        defval: "",
        blankrows: true,
        raw: false,
      });
      if (matrix.length === 0) continue;

      // Détection de la ligne d'en-tête : parmi les 15 premières lignes,
      // celle qui contient le plus de cellules non vides.
      const scanLimit = Math.min(15, matrix.length);
      let headerIdx = 0;
      let bestCount = -1;
      for (let i = 0; i < scanLimit; i++) {
        const count = (matrix[i] || []).filter((c) => String(c ?? "").trim() !== "").length;
        if (count > bestCount) { bestCount = count; headerIdx = i; }
      }
      if (bestCount <= 0) continue; // feuille vide

      const rawHeader = (matrix[headerIdx] || []).map((c) => String(c ?? "").trim());
      // Largeur = max entre l'en-tête et toutes les lignes de données (aucune colonne perdue)
      let width = rawHeader.length;
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        width = Math.max(width, (matrix[i] || []).length);
      }
      const columns: string[] = [];
      for (let c = 0; c < width; c++) {
        const label = rawHeader[c] ?? "";
        columns.push(label !== "" ? label : `Colonne ${c + 1}`);
      }

      // Lignes complémentaires situées AVANT l'en-tête (titres, périodes, etc.)
      const preamble = matrix.slice(0, headerIdx).map((r) => (r || []).map((c) => String(c ?? "")));

      // Lignes de données : cellules vides conservées, ordre préservé.
      // Les lignes entièrement vides sont ignorées (bruit de fin de feuille).
      const dataRows: { rowIndex: number; cells: string[] }[] = [];
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const raw = matrix[i] || [];
        const cells: string[] = [];
        for (let c = 0; c < width; c++) cells.push(String(raw[c] ?? ""));
        if (cells.every((v) => v.trim() === "")) continue;
        dataRows.push({ rowIndex: dataRows.length, cells });
      }
      if (dataRows.length === 0 && preamble.length === 0) continue;

      const resteColumnIndex = detectResteColumnIndex(columns);

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
