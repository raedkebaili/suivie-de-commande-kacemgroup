export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { FOLDER_MIME, ensureRootFolder, friendlyDriveError, getDriveClient } from "@/lib/google-drive";

/**
 * GET /api/storage/stats[?refresh=1]
 * Tableau de bord du stockage : nombre de fichiers, volume, dernier ajout,
 * dernière synchro (date réelle enregistrée) et quota RÉEL renvoyé par Google.
 *
 * Performance : le parcours de l'arborescence est fait par dossier, en parallèle
 * (plusieurs dossiers à la fois), sans vérification d'appartenance par fichier.
 * Le résultat est gardé 60 s ; `refresh=1` force un nouveau calcul.
 */

const SCAN_CACHE_MS = 60_000;
const SCAN_CONCURRENCY = 8;
const SCAN_MAX_REQUESTS = 2000; // garde-fou : au-delà, le résultat est marqué partiel

type ScanResult = {
  fileCount: number;
  folderCount: number;
  managedSize: number;
  lastFile: { name: string; modifiedTime: string } | null;
  partial: boolean;
  scannedAt: string;
};

let scanCache: { rootId: string; at: number; result: ScanResult } | null = null;

type DriveFileRow = { id?: string | null; name?: string | null; mimeType?: string | null; size?: string | null; modifiedTime?: string | null };

async function scanTree(drive: Awaited<ReturnType<typeof getDriveClient>>["drive"], rootId: string): Promise<ScanResult> {
  let fileCount = 0, folderCount = 0, managedSize = 0, requests = 0, partial = false;
  let lastFile: { name: string; modifiedTime: string } | null = null;
  let frontier: string[] = [rootId];

  // Liste tous les éléments directs d'un dossier (pagination incluse)
  const listChildren = async (folderId: string): Promise<DriveFileRow[]> => {
    const rows: DriveFileRow[] = [];
    let pageToken: string | undefined;
    do {
      requests++;
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "nextPageToken, files(id,name,mimeType,size,modifiedTime)",
        pageSize: 1000, pageToken, spaces: "drive",
      });
      rows.push(...(res.data.files || []));
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    return rows;
  };

  while (frontier.length > 0) {
    if (requests >= SCAN_MAX_REQUESTS) { partial = true; break; }
    const next: string[] = [];
    // Dossiers du niveau courant traités par lots parallèles
    for (let i = 0; i < frontier.length; i += SCAN_CONCURRENCY) {
      const batch = frontier.slice(i, i + SCAN_CONCURRENCY);
      const results = await Promise.all(batch.map(listChildren));
      for (const children of results) {
        for (const f of children) {
          if (!f.id) continue;
          if (f.mimeType === FOLDER_MIME) { folderCount++; next.push(f.id); continue; }
          fileCount++;
          if (f.size) managedSize += Number(f.size);
          if (f.modifiedTime && (!lastFile || f.modifiedTime > lastFile.modifiedTime)) {
            lastFile = { name: f.name || "", modifiedTime: f.modifiedTime };
          }
        }
      }
    }
    frontier = next;
  }
  return { fileCount, folderCount, managedSize, lastFile, partial, scannedAt: new Date().toISOString() };
}

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const { drive, cfg } = await getDriveClient();
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";

    // Racine : identifiant stocké, sinon création/recherche (une seule fois)
    let rootId = cfg.rootFolderId || "";
    if (!rootId) rootId = (await ensureRootFolder()).id;

    const aboutPromise = drive.about.get({ fields: "user(emailAddress),storageQuota" });
    aboutPromise.catch(() => { /* erreur relancée plus bas, au moment de l'attente */ });
    const now = Date.now();
    const cacheValid = !refresh && scanCache && scanCache.rootId === rootId && now - scanCache.at < SCAN_CACHE_MS;
    const scan = cacheValid ? scanCache!.result : await scanTree(drive, rootId);
    if (!cacheValid) scanCache = { rootId, at: now, result: scan };

    const about = await aboutPromise;
    const q = about.data.storageQuota;
    const limit = q?.limit ? Number(q.limit) : null;
    const usage = q?.usage ? Number(q.usage) : null;

    return NextResponse.json({
      account: about.data.user?.emailAddress || null,
      rootFolderName: cfg.rootFolderName || null,
      fileCount: scan.fileCount,
      folderCount: scan.folderCount,
      managedSize: scan.managedSize,
      lastFile: scan.lastFile,
      partial: scan.partial,
      scannedAt: scan.scannedAt,
      // Date réelle de la dernière synchronisation enregistrée (et non l'heure de la requête)
      lastSync: cfg.lastSyncAt ?? null,
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
