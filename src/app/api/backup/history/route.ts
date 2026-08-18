import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { backupHistory } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/backup/history
 * Récupère l'historique des sauvegardes (SANS le contenu JSON volumineux)
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  if (user.role !== "superadmin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "50");
    const type = url.searchParams.get("type"); // "manual", "automatic", ou null pour tous

    // Sélection explicite SANS backupData (économie de bande passante)
    const rows = await db.select({
      id: backupHistory.id,
      filename: backupHistory.filename,
      filepath: backupHistory.filepath,
      filesize: backupHistory.filesize,
      totalRecords: backupHistory.totalRecords,
      type: backupHistory.type,
      status: backupHistory.status,
      errorMessage: backupHistory.errorMessage,
      // Indique si le fichier est téléchargeable (backupData non null)
      hasData: backupHistory.backupData,
      createdAt: backupHistory.createdAt,
      createdById: backupHistory.createdById,
      createdByName: backupHistory.createdByName,
    })
      .from(backupHistory)
      .orderBy(desc(backupHistory.createdAt))
      .limit(limitParam);

    // Filtrer par type si spécifié, et transformer hasData en booléen
    const history = rows
      .filter(r => !type || r.type === type)
      .map(r => ({
        ...r,
        hasData: r.hasData !== null && r.hasData !== "",
      }));

    // Statistiques
    const stats = {
      total: rows.length,
      automatic: rows.filter(h => h.type === "automatic").length,
      manual: rows.filter(h => h.type === "manual").length,
      success: rows.filter(h => h.status === "success").length,
      error: rows.filter(h => h.status === "error").length,
    };

    return NextResponse.json({ history, stats });
  } catch (error) {
    console.error("Erreur récupération historique:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
