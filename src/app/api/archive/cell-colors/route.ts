export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { archiveCellColors, archiveRows } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { isValidHexColor, normalizeHexColor } from "@/lib/color-utils";

/**
 * PUT /api/archive/cell-colors — SUPERADMIN UNIQUEMENT
 * Définit (ou retire) la couleur personnalisée d'UNE cellule d'archive.
 * Body: { rowId: number, columnIndex: number, color: "#RRGGBB" | null }
 *
 * - color null  → suppression : la cellule reprend automatiquement la couleur
 *                 de l'état de sa ligne.
 * - Persistance en base (jamais localStorage), clé unique
 *   (rowId + columnIndex) : deux cellules identiques de lignes différentes
 *   ne partagent jamais leur configuration.
 * - Indépendant de l'état de la ligne : changer l'état ne l'efface pas.
 */
export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const body = await request.json();
    const rowId = parseInt(body.rowId);
    const columnIndex = parseInt(body.columnIndex);
    if (!Number.isFinite(rowId) || !Number.isFinite(columnIndex) || columnIndex < 0) {
      return NextResponse.json({ error: "rowId et columnIndex requis" }, { status: 400 });
    }

    const [row] = await db.select().from(archiveRows).where(eq(archiveRows.id, rowId)).limit(1);
    if (!row) return NextResponse.json({ error: "Ligne d'archive non trouvée" }, { status: 404 });

    const rawColor = body.color;
    const where = and(eq(archiveCellColors.rowId, rowId), eq(archiveCellColors.columnIndex, columnIndex));

    // ── Suppression de la personnalisation ──
    if (rawColor === null || rawColor === undefined || rawColor === "") {
      await db.delete(archiveCellColors).where(where);
      await logActivity(user.id, user.username, "CLEAR_ARCHIVE_CELL_COLOR", `Ligne ${rowId}, colonne ${columnIndex}`);
      return NextResponse.json({ cellColor: null });
    }

    if (!isValidHexColor(String(rawColor))) {
      return NextResponse.json({ error: "Code couleur HEX invalide. Format attendu: #RRGGBB" }, { status: 400 });
    }
    const color = normalizeHexColor(String(rawColor));
    const now = new Date().toISOString();

    const [existing] = await db.select().from(archiveCellColors).where(where).limit(1);
    let saved;
    if (existing) {
      [saved] = await db.update(archiveCellColors)
        .set({ color, updatedById: user.id, updatedByName: user.fullName, updatedAt: now })
        .where(where).returning();
    } else {
      [saved] = await db.insert(archiveCellColors)
        .values({ sheetId: row.sheetId, rowId, columnIndex, color, updatedById: user.id, updatedByName: user.fullName })
        .returning();
    }

    await logActivity(user.id, user.username, "SET_ARCHIVE_CELL_COLOR", `Ligne ${rowId}, colonne ${columnIndex} → ${color}`);
    return NextResponse.json({ cellColor: { rowId: saved.rowId, columnIndex: saved.columnIndex, color: saved.color } });
  } catch (error) {
    console.error("Erreur couleur cellule archive:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement de la couleur" }, { status: 500 });
  }
}
