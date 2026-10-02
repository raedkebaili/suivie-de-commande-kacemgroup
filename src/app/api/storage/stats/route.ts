export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { FOLDER_MIME, ensureRootFolder, friendlyDriveError, getDriveClient } from "@/lib/google-drive";

/**
 * GET /api/storage/stats
 * Tableau de bord du stockage : nombre de fichiers, volume, dernier ajout,
 * et quota RÉEL renvoyé par Google (aucune valeur inventée).
 *
 * Remarque : Google peut ne pas fournir de limite (comptes Workspace avec
 * stockage « illimité ») — dans ce cas `limit` vaut null et l'interface
 * l'indique explicitement plutôt que d'afficher un faux quota.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const { drive } = await getDriveClient();
    const root = await ensureRootFolder();

    const about = await drive.about.get({ fields: "user(emailAddress),storageQuota" });
    const q = about.data.storageQuota;

    // Parcours paginé limité : compte les fichiers gérés par l'application
    let fileCount = 0, folderCount = 0, totalSize = 0;
    let latest: { name: string; modifiedTime: string } | null = null;
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page++) { // garde-fou : 20 × 1000 fichiers
      const res = await drive.files.list({
        q: "trashed=false",
        fields: "nextPageToken, files(id,name,mimeType,size,modifiedTime)",
        pageSize: 1000, pageToken, spaces: "drive",
      });
      for (const f of res.data.files || []) {
        if (f.mimeType === FOLDER_MIME) { folderCount++; continue; }
        fileCount++;
        if (f.size) totalSize += Number(f.size);
        if (f.modifiedTime && (!latest || f.modifiedTime > latest.modifiedTime)) {
          latest = { name: f.name || "", modifiedTime: f.modifiedTime };
        }
      }
      pageToken = res.data.nextPageToken || undefined;
      if (!pageToken) break;
    }

    const limit = q?.limit ? Number(q.limit) : null;
    const usage = q?.usage ? Number(q.usage) : null;

    return NextResponse.json({
      account: about.data.user?.emailAddress || null,
      rootFolderName: root.name,
      fileCount, folderCount, managedSize: totalSize,
      lastFile: latest,
      lastSync: new Date().toISOString(),
      quota: {
        limit, usage,
        available: limit !== null && usage !== null ? Math.max(0, limit - usage) : null,
        percent: limit && usage !== null ? Math.min(100, (usage / limit) * 100) : null,
        // true lorsque Google ne communique pas de limite (stockage sans quota défini)
        unlimited: limit === null,
      },
    });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Statistiques Google Drive:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
