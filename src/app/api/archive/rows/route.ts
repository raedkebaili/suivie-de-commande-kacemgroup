export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { archiveCellColors, archiveRows, archiveSheets } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";
import { resolveArchiveRowState } from "@/lib/archive-constants";

/**
 * GET /api/archive/rows?sheetId=1&q=&state=&page=1&pageSize=100
 * Contenu d'une feuille d'archive : colonnes, préambule, lignes, états et
 * couleurs personnalisées de cellules.
 * Lecture : tout utilisateur authentifié.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const sheetId = parseInt(sp.get("sheetId") || "");
  if (!Number.isFinite(sheetId)) return NextResponse.json({ error: "sheetId requis" }, { status: 400 });

  const q = (sp.get("q") || "").trim().toLowerCase();
  const stateFilter = (sp.get("state") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1") || 1);
  const pageSize = Math.min(500, Math.max(10, parseInt(sp.get("pageSize") || "100") || 100));

  try {
    const [sheet] = await db.select().from(archiveSheets).where(eq(archiveSheets.id, sheetId)).limit(1);
    if (!sheet) return NextResponse.json({ error: "Feuille non trouvée" }, { status: 404 });

    const columns: string[] = safeParseArray(sheet.columns);
    const preamble: string[][] = sheet.preamble ? safeParseArray(sheet.preamble) : [];

    const rows = await db.select().from(archiveRows)
      .where(eq(archiveRows.sheetId, sheetId))
      .orderBy(asc(archiveRows.rowIndex));

    const colors = await db.select().from(archiveCellColors).where(eq(archiveCellColors.sheetId, sheetId));
    const colorsByRow = new Map<number, Record<number, string>>();
    for (const c of colors) {
      const entry = colorsByRow.get(c.rowId) || {};
      entry[c.columnIndex] = c.color;
      colorsByRow.set(c.rowId, entry);
    }

    const resteIdx = sheet.resteColumnIndex;

    let mapped = rows.map((r) => {
      const cells: string[] = safeParseArray(r.cells);
      const resteRaw = resteIdx !== null && resteIdx !== undefined ? cells[resteIdx] : null;
      return {
        id: r.id,
        rowIndex: r.rowIndex,
        cells,
        // État manuel (peut être null) et état effectif (manuel > Reste=0 > aucun)
        stateOverride: r.stateOverride,
        state: resolveArchiveRowState(r.stateOverride, resteRaw),
        updatedByName: r.updatedByName,
        cellColors: colorsByRow.get(r.id) || {},
      };
    });

    if (stateFilter) {
      mapped = stateFilter === "NONE"
        ? mapped.filter((r) => r.state === null)
        : mapped.filter((r) => r.state === stateFilter);
    }
    if (q.length >= 2) {
      mapped = mapped.filter((r) => r.cells.some((c) => (c || "").toLowerCase().includes(q)));
    }

    const total = mapped.length;
    const start = (page - 1) * pageSize;
    const paged = mapped.slice(start, start + pageSize);

    return NextResponse.json({
      sheet: {
        id: sheet.id,
        name: sheet.name,
        sourceFilename: sheet.sourceFilename,
        rowCount: sheet.rowCount,
        importedByName: sheet.importedByName,
        createdAt: sheet.createdAt,
        resteColumnIndex: resteIdx,
      },
      columns,
      preamble,
      rows: paged,
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    console.error("Erreur lecture lignes archive:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des lignes" }, { status: 500 });
  }
}

function safeParseArray<T = string[]>(raw: string): T {
  try {
    const v = JSON.parse(raw);
    return (Array.isArray(v) ? v : []) as T;
  } catch {
    return [] as unknown as T;
  }
}
