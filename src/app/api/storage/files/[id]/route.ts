export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { friendlyDriveError, getDriveClient } from "@/lib/google-drive";

/**
 * PUT /api/storage/files/[id] — renommer et/ou déplacer
 * Body: { name?: string, parentId?: string }
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role === "gerant") return NextResponse.json({ error: "Accès en lecture seule" }, { status: 403 });

  const { id } = await params;
  try {
    const body = await request.json();
    const { drive } = await getDriveClient();

    const current = await drive.files.get({ fileId: id, fields: "id,name,parents" });
    const requestBody: Record<string, unknown> = {};
    let action = "";

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
      if (name.length > 200) return NextResponse.json({ error: "Nom trop long (200 caractères max)" }, { status: 400 });
      requestBody.name = name;
      action = `Renommé « ${current.data.name} » → « ${name} »`;
    }

    let addParents: string | undefined, removeParents: string | undefined;
    if (body.parentId !== undefined && String(body.parentId)) {
      addParents = String(body.parentId);
      removeParents = (current.data.parents || []).join(",");
      action = action ? `${action} et déplacé` : `Déplacé « ${current.data.name} »`;
    }

    if (Object.keys(requestBody).length === 0 && !addParents) {
      return NextResponse.json({ error: "Aucune modification demandée" }, { status: 400 });
    }

    const updated = await drive.files.update({
      fileId: id, requestBody, addParents, removeParents, fields: "id,name,parents",
    });

    await logActivity(user.id, user.username, body.parentId ? "STORAGE_MOVE" : "STORAGE_RENAME", action);
    return NextResponse.json({ ok: true, file: { id: updated.data.id, name: updated.data.name } });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Modification Google Drive:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/storage/files/[id]
 * Supprime réellement le fichier ou dossier sur Google Drive.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role === "gerant") return NextResponse.json({ error: "Accès en lecture seule" }, { status: 403 });

  const { id } = await params;
  try {
    const { drive, cfg } = await getDriveClient();
    if (cfg.rootFolderId && id === cfg.rootFolderId) {
      return NextResponse.json({ error: "Le dossier racine du stockage ne peut pas être supprimé." }, { status: 400 });
    }
    const meta = await drive.files.get({ fileId: id, fields: "id,name" });
    await drive.files.delete({ fileId: id });
    await logActivity(user.id, user.username, "STORAGE_DELETE", `Supprimé: ${meta.data.name}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Suppression Google Drive:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
