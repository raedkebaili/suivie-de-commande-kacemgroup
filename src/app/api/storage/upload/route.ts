export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { bufferToStream, ensureRootFolder, friendlyDriveError, getDriveClient } from "@/lib/google-drive";

// Validation côté SERVEUR (doublée côté client) : PDF uniquement par défaut
const MAX_SIZE = 50 * 1024 * 1024; // 50 Mo par fichier
const ALLOWED_MIME = ["application/pdf"];

/**
 * POST /api/storage/upload (multipart)
 * Téléverse un ou plusieurs fichiers dans le dossier central.
 * Les utilisateurs n'accèdent jamais à Google directement : le backend
 * applique l'authentification puis relaie le flux vers Drive.
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const fd = await request.formData();
    const files = fd.getAll("files").filter((f): f is File => f instanceof File);
    const single = fd.get("file");
    if (single instanceof File) files.push(single);
    if (files.length === 0) return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });

    const { drive } = await getDriveClient();
    const root = await ensureRootFolder();
    const folderId = String(fd.get("folderId") || "") || root.id;

    const uploaded: { name: string; id: string; size: number }[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (const file of files) {
      // Validation stricte : type MIME ET extension
      const isPdfMime = ALLOWED_MIME.includes(file.type);
      const isPdfExt = file.name.toLowerCase().endsWith(".pdf");
      if (!isPdfMime || !isPdfExt) { failed.push({ name: file.name, reason: "Seuls les fichiers PDF sont acceptés" }); continue; }
      if (file.size > MAX_SIZE) { failed.push({ name: file.name, reason: `Fichier trop volumineux (max ${MAX_SIZE / 1024 / 1024} Mo)` }); continue; }
      if (file.size === 0) { failed.push({ name: file.name, reason: "Fichier vide" }); continue; }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const created = await drive.files.create({
          requestBody: { name: file.name, parents: [folderId] },
          media: { mimeType: "application/pdf", body: bufferToStream(buffer) },
          fields: "id,name,size",
        });
        uploaded.push({ name: created.data.name || file.name, id: created.data.id!, size: file.size });
      } catch (e) {
        const { message } = friendlyDriveError(e);
        console.error("Upload Google Drive:", e);
        failed.push({ name: file.name, reason: message });
      }
    }

    if (uploaded.length > 0) {
      await logActivity(user.id, user.username, "STORAGE_UPLOAD",
        `${uploaded.length} fichier(s) téléversé(s): ${uploaded.map(u => u.name).join(", ").slice(0, 200)}`);
    }

    return NextResponse.json({
      ok: failed.length === 0,
      uploaded, failed,
      summary: { total: files.length, success: uploaded.length, errors: failed.length },
    }, { status: uploaded.length > 0 ? 201 : 400 });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Erreur upload stockage:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
