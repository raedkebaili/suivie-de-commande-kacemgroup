export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { FOLDER_MIME, ensureRootFolder, friendlyDriveError, getDriveClient } from "@/lib/google-drive";

/**
 * POST /api/storage/folders — crée un dossier
 * Body: { name, parentId? }
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Nom du dossier requis" }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: "Nom trop long (120 caractères max)" }, { status: 400 });

    const { drive } = await getDriveClient();
    const root = await ensureRootFolder();
    const parentId = String(body.parentId || "") || root.id;

    const created = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: "id,name",
    });

    await logActivity(user.id, user.username, "STORAGE_CREATE_FOLDER", `Dossier créé: ${name}`);
    return NextResponse.json({ ok: true, folder: { id: created.data.id, name: created.data.name } }, { status: 201 });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Création dossier Google Drive:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * GET /api/storage/folders — arborescence des dossiers (pour le déplacement)
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const { drive } = await getDriveClient();
    const root = await ensureRootFolder();
    const res = await drive.files.list({
      q: `mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: "files(id,name,parents)", pageSize: 200, orderBy: "name", spaces: "drive",
    });
    return NextResponse.json({
      root: { id: root.id, name: root.name },
      folders: (res.data.files || []).map(f => ({ id: f.id, name: f.name, parents: f.parents || [] })),
    });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
