export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { archiveRows, archiveSheets } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

/**
 * GET /api/archive/sheets
 * Liste des feuilles (périodes) d'archive.
 * Lecture : tout utilisateur authentifié (consultation autorisée à tous).
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const sheets = await db
      .select({
        id: archiveSheets.id,
        name: archiveSheets.name,
        sourceFilename: archiveSheets.sourceFilename,
        sheetIndex: archiveSheets.sheetIndex,
        rowCount: archiveSheets.rowCount,
        importedByName: archiveSheets.importedByName,
        createdAt: archiveSheets.createdAt,
      })
      .from(archiveSheets)
      .orderBy(asc(archiveSheets.sheetIndex), asc(archiveSheets.name));
    return NextResponse.json({ sheets });
  } catch (error) {
    console.error("Erreur lecture feuilles archive:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des archives" }, { status: 500 });
  }
}

/**
 * DELETE /api/archive/sheets?id=123
 * Supprime une feuille d'archive et tout son contenu — superadmin uniquement.
 * N'affecte AUCUNE commande active (tables totalement séparées).
 */
export async function DELETE(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const id = parseInt(new URL(request.url).searchParams.get("id") || "");
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  try {
    const [sheet] = await db.select().from(archiveSheets).where(eq(archiveSheets.id, id)).limit(1);
    if (!sheet) return NextResponse.json({ error: "Feuille non trouvée" }, { status: 404 });

    // Les lignes et couleurs de cellules partent en cascade (FK onDelete: cascade),
    // on supprime explicitement les lignes pour rester cohérent avec le style du projet.
    await db.delete(archiveRows).where(eq(archiveRows.sheetId, id));
    await db.delete(archiveSheets).where(eq(archiveSheets.id, id));

    await logActivity(user.id, user.username, "DELETE_ARCHIVE_SHEET", `Archive supprimée: ${sheet.name}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erreur suppression feuille archive:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
