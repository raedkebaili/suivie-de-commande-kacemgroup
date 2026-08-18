export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { backupHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

/**
 * GET /api/backup/download/[id]
 * Télécharge le fichier JSON d'une sauvegarde stockée dans l'historique
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromHeaders(request);
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;
  const backupId = parseInt(id);
  if (isNaN(backupId)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }

  const [record] = await db
    .select()
    .from(backupHistory)
    .where(eq(backupHistory.id, backupId))
    .limit(1);

  if (!record) {
    return NextResponse.json({ error: "Sauvegarde non trouvée" }, { status: 404 });
  }

  if (!record.backupData) {
    return NextResponse.json(
      { error: "Le contenu de cette sauvegarde n'est plus disponible (anciennes sauvegardes manuelles ou erreur). Utilisez le bouton « Télécharger » pour créer une nouvelle sauvegarde manuelle." },
      { status: 410 }
    );
  }

  return new NextResponse(record.backupData, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${record.filename}"`,
    },
  });
}
