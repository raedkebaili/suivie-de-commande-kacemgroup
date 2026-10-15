export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { archiveCellModifications, archiveRows, archiveSheets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { ARCHIVE_STATE_BY_KEY, resolveArchiveRowState, resolveArchiveStateSource } from "@/lib/archive-constants";
import { archiveRightsFor, changedCellIndexes } from "@/lib/archive-rights";

/**
 * PUT /api/archive/rows/[id]
 * Droits (voir src/lib/archive-rights.ts) :
 * - état : superadmin et planification ;
 * - cellules : superadmin, planification, technique et commercial.
 * Une cellule modifiée par un commercial est marquée (archive_cell_modifications)
 * pour être affichée dans la couleur « Champs Modifiés » du gestionnaire.
 * Body: { state?: "LIVRE" | "PREVISION" | "PRET_A_LIVRE" | "ANNULE" | null, cells?: string[] }
 *
 * IMPORTANT : changer l'état ne touche JAMAIS aux couleurs personnalisées
 * des cellules (table archive_cell_colors distincte, aucune suppression ici).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const rights = archiveRightsFor(user.role);
  if (!rights.canEditCells && !rights.canChangeState) return NextResponse.json({ error: "Accès réservé au superadmin, au responsable planification, au responsable technique et au commercial" }, { status: 403 });

  const { id } = await params;
  const rowId = parseInt(id);
  if (!Number.isFinite(rowId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [row] = await db.select().from(archiveRows).where(eq(archiveRows.id, rowId)).limit(1);
    if (!row) return NextResponse.json({ error: "Ligne non trouvée" }, { status: 404 });

    const body = await request.json() as { state?: unknown; cells?: unknown };
    const hasState = Object.prototype.hasOwnProperty.call(body, "state");
    const hasCells = Object.prototype.hasOwnProperty.call(body, "cells");
    if (!hasState && !hasCells) return NextResponse.json({ error: "Aucune modification fournie" }, { status: 400 });
    if (hasState && !rights.canChangeState) {
      return NextResponse.json({ error: "Seuls le superadmin et le responsable planification peuvent modifier l'état d'une archive" }, { status: 403 });
    }
    if (hasCells && !rights.canEditCells) {
      return NextResponse.json({ error: "Votre rôle ne peut pas modifier les champs de l'archive" }, { status: 403 });
    }

    const rawState = hasState ? body.state : row.stateOverride;
    const state: string | null = rawState === null || rawState === undefined || rawState === "" ? null : String(rawState);
    if (state !== null && !ARCHIVE_STATE_BY_KEY[state]) {
      return NextResponse.json({ error: "État invalide" }, { status: 400 });
    }

    const [sheet] = await db.select().from(archiveSheets).where(eq(archiveSheets.id, row.sheetId)).limit(1);
    if (!sheet) return NextResponse.json({ error: "Feuille non trouvée" }, { status: 404 });
    let cells: string[];
    try {
      const existing = JSON.parse(row.cells);
      cells = Array.isArray(existing) ? existing.map((value) => String(value ?? "")) : [];
    } catch {
      cells = [];
    }
    const previousCells = [...cells];
    if (hasCells) {
      if (!Array.isArray(body.cells) || !body.cells.every((value) => typeof value === "string")) {
        return NextResponse.json({ error: "Cellules invalides" }, { status: 400 });
      }
      const sourceCells = body.cells;
      let columnCount = 0;
      try {
        const parsedColumns = JSON.parse(sheet.columns);
        columnCount = Array.isArray(parsedColumns) ? parsedColumns.length : 0;
      } catch { /* conserve la largeur existante si les métadonnées sont invalides */ }
      const width = Math.max(cells.length, columnCount);
      // Une requête partielle ne peut pas effacer silencieusement les cellules
      // absentes ; la largeur reste celle de la ligne/feuille existante.
      cells = Array.from({ length: width }, (_, index) => sourceCells[index] ?? cells[index] ?? "");
    }

    const [updated] = await db.update(archiveRows)
      .set({
        ...(hasState ? { stateOverride: state } : {}),
        ...(hasCells ? { cells: JSON.stringify(cells) } : {}),
        updatedById: user.id,
        updatedByName: user.fullName,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(archiveRows.id, rowId))
      .returning();

    // Marquage des cellules modifiées par un commercial (couleur « Champs Modifiés »)
    const changedIndexes = hasCells ? changedCellIndexes(previousCells, cells) : [];
    if (rights.marksCommercialEdits && changedIndexes.length > 0) {
      const modifiedAt = new Date().toISOString();
      await db.insert(archiveCellModifications)
        .values(changedIndexes.map((columnIndex) => ({
          sheetId: row.sheetId,
          rowId,
          columnIndex,
          modifiedById: user.id,
          modifiedByName: user.fullName,
          modifiedAt,
        })))
        .onConflictDoUpdate({
          target: [archiveCellModifications.rowId, archiveCellModifications.columnIndex],
          set: { modifiedById: user.id, modifiedByName: user.fullName, modifiedAt },
        });
    }
    const modifiedRows = await db.select({ columnIndex: archiveCellModifications.columnIndex })
      .from(archiveCellModifications)
      .where(eq(archiveCellModifications.rowId, rowId));

    // Recalcul de l'état effectif (retour à l'automatique si state = null)
    const resteIdx = sheet.resteColumnIndex;
    const resteRaw = resteIdx !== null && resteIdx !== undefined ? cells[resteIdx] : null;
    const action = hasCells && hasState ? "UPDATE_ARCHIVE_ROW_AND_STATE" : hasCells ? "UPDATE_ARCHIVE_ROW" : "UPDATE_ARCHIVE_ROW_STATE";
    const details = hasCells
      ? `Archive "${sheet.name}" ligne ${row.rowIndex + 1} modifiée${hasState ? `, état → ${state ? ARCHIVE_STATE_BY_KEY[state].label : "automatique"}` : ""}`
      : `Archive "${sheet.name}" ligne ${row.rowIndex + 1} → ${state ? ARCHIVE_STATE_BY_KEY[state].label : "automatique"}`;
    await logActivity(user.id, user.username, action, details);

    return NextResponse.json({
      row: {
        id: updated.id,
        cells,
        stateOverride: updated.stateOverride,
        stateDetected: updated.stateDetected,
        // state = null remet la ligne sur l'état du fichier, puis sur la règle auto
        state: resolveArchiveRowState(updated.stateOverride, resteRaw, updated.stateDetected),
        stateSource: resolveArchiveStateSource(updated.stateOverride, resteRaw, updated.stateDetected),
        updatedByName: updated.updatedByName,
        modifiedColumns: modifiedRows.map((m) => m.columnIndex).sort((a, b) => a - b),
      },
    });
  } catch (error) {
    console.error("Erreur mise à jour état archive:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour de l'état" }, { status: 500 });
  }
}
