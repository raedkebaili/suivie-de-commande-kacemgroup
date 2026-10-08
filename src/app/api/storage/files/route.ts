export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { FOLDER_MIME, assertInsideRoot, ensureRootFolder, friendlyDriveError, getDriveClient, updateConfig } from "@/lib/google-drive";

/**
 * GET /api/storage/files
 * Liste paginée du contenu d'un dossier (ou recherche globale).
 * La pagination et la recherche sont déléguées à l'API Google Drive :
 * on ne télécharge jamais l'intégralité du Drive.
 *
 * Query : folderId, q, pageToken, pageSize (25|50|100), sort, type
 * Lecture : tout utilisateur authentifié.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const search = (sp.get("q") || "").trim();
  const pageToken = sp.get("pageToken") || undefined;
  const pageSize = Math.min(100, Math.max(10, parseInt(sp.get("pageSize") || "50") || 50));
  const sort = sp.get("sort") || "modifiedTime desc";
  const typeFilter = sp.get("type") || "";

  const ALLOWED_SORT = new Set([
    "name", "name desc", "modifiedTime", "modifiedTime desc",
    "quotaBytesUsed", "quotaBytesUsed desc", "folder,name",
  ]);
  const orderBy = ALLOWED_SORT.has(sort) ? sort : "modifiedTime desc";

  try {
    const { drive } = await getDriveClient();
    const root = await ensureRootFolder();
    const folderId = sp.get("folderId") || root.id;
    if (folderId !== root.id && !(await assertInsideRoot(folderId))) {
      return NextResponse.json({ error: "Dossier hors du stockage applicatif" }, { status: 404 });
    }

    // Recherche : portée à l'ensemble des fichiers de l'application (scope drive.file)
    const clauses: string[] = ["trashed=false"];
    if (search.length >= 2) {
      clauses.push(`name contains '${search.replace(/'/g, "\\'")}'`);
    } else {
      clauses.push(`'${folderId}' in parents`);
    }
    if (typeFilter === "pdf") clauses.push("mimeType='application/pdf'");
    if (typeFilter === "folder") clauses.push(`mimeType='${FOLDER_MIME}'`);

    const res = await drive.files.list({
      q: clauses.join(" and "),
      fields: "nextPageToken, files(id,name,mimeType,size,modifiedTime,createdTime,parents,iconLink,webViewLink)",
      pageSize, pageToken, orderBy, spaces: "drive",
    });

    const files = (res.data.files || []).map(f => ({
      id: f.id, name: f.name, mimeType: f.mimeType,
      isFolder: f.mimeType === FOLDER_MIME,
      size: f.size ? Number(f.size) : null,
      modifiedTime: f.modifiedTime, createdTime: f.createdTime,
      parents: f.parents || [],
    }));

    // Fil d'Ariane (depuis le dossier courant jusqu'à la racine)
    const breadcrumb: { id: string; name: string }[] = [];
    if (!search) {
      let cur: string | undefined = folderId;
      for (let i = 0; i < 10 && cur; i++) {
        const meta: { data: { id?: string | null; name?: string | null; parents?: string[] | null } } =
          await drive.files.get({ fileId: cur, fields: "id,name,parents" });
        breadcrumb.unshift({ id: meta.data.id!, name: meta.data.name || "" });
        if (meta.data.id === root.id) break;
        cur = meta.data.parents?.[0];
      }
    }

    await updateConfig({ lastSyncAt: new Date().toISOString() }).catch(() => {});

    return NextResponse.json({
      files,
      nextPageToken: res.data.nextPageToken || null,
      folderId, rootFolderId: root.id, rootFolderName: root.name,
      breadcrumb, searching: search.length >= 2,
    });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Listing Google Drive:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
