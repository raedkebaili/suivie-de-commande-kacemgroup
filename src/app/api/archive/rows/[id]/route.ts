export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { archiveRows, archiveSheets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { ARCHIVE_STATE_BY_KEY, resolveArchiveRowState } from "@/lib/archive-constants";

/**
 * PUT /api/archive/rows/[id]
 * Modifie l'état d'une ligne d'archive — SUPERADMIN UNIQUEMENT.
 * Body: { state: "LIVRE" | "PREVISION" | "PRET_A_LIVRE" | "ANNULE" | null }
 *
 * IMPORTANT : changer l'état ne touche JAMAIS aux couleurs personnalisées
 * des cellules (table archive_cell_colors distincte, aucune suppression ici).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const rowId = parseInt(id);
  if (!Number.isFinite(rowId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [row] = await db.select().from(archiveRows).where(eq(archiveRows.id, rowId)).limit(1);
    if (!row) return NextResponse.json({ error: "Ligne non trouvée" }, { status: 404 });

    const body = await request.json();
    const raw = body.state;
    const state: string | null = raw === null || raw === undefined || raw === "" ? null : String(raw);
    if (state !== null && !ARCHIVE_STATE_BY_KEY[state]) {
      return NextResponse.json({ error: "État invalide" }, { status: 400 });
    }

    const [updated] = await db.update(archiveRows)
      .set({ stateOverride: state, updatedById: user.id, updatedByName: user.fullName, updatedAt: new Date().toISOString() })
      .where(eq(archiveRows.id, rowId))
      .returning();

    // Recalcul de l'état effectif (retour à l'automatique si state = null)
    const [sheet] = await db.select().from(archiveSheets).where(eq(archiveSheets.id, row.sheetId)).limit(1);
    let cells: string[] = [];
    try { const p = JSON.parse(updated.cells); if (Array.isArray(p)) cells = p; } catch { /* ignore */ }
    const resteIdx = sheet?.resteColumnIndex;
    const resteRaw = resteIdx !== null && resteIdx !== undefined ? cells[resteIdx] : null;

    await logActivity(user.id, user.username, "UPDATE_ARCHIVE_ROW_STATE",
      `Archive "${sheet?.name || row.sheetId}" ligne ${row.rowIndex + 1} → ${state ? ARCHIVE_STATE_BY_KEY[state].label : "automatique"}`);

    return NextResponse.json({
      row: {
        id: updated.id,
        stateOverride: updated.stateOverride,
        state: resolveArchiveRowState(updated.stateOverride, resteRaw),
        updatedByName: updated.updatedByName,
      },
    });
  } catch (error) {
    console.error("Erreur mise à jour état archive:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour de l'état" }, { status: 500 });
  }
}
