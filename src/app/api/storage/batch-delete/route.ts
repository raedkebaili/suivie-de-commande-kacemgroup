export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { FOLDER_MIME, assertInsideRoot, ensureRootFolder, friendlyDriveError, getDriveClient } from "@/lib/google-drive";

const CONFIRMATION_TEXT = "SUPPRIMER";

/**
 * POST /api/storage/batch-delete
 *
 * Deux modes :
 *  - { ids: string[] }              → suppression de la sélection
 *  - { all: true, confirmation }    → suppression de TOUS les fichiers
 *                                      (SUPERADMIN + saisie de « SUPPRIMER »)
 *
 * Le dossier racine n'est jamais supprimé.
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role === "gerant") return NextResponse.json({ error: "Accès en lecture seule" }, { status: 403 });

  try {
    const body = await request.json();
    const { drive, cfg } = await getDriveClient();
    const root = await ensureRootFolder();

    let targets: { id: string; name: string }[] = [];

    if (body.all === true) {
      // ── Suppression totale : réservée à l'administrateur ──
      if (user.role !== "superadmin") {
        return NextResponse.json({ error: "Seul l'administrateur peut vider le stockage." }, { status: 403 });
      }
      if (String(body.confirmation || "") !== CONFIRMATION_TEXT) {
        return NextResponse.json({
          error: `Saisissez exactement ${CONFIRMATION_TEXT} pour confirmer la suppression de tous les fichiers.`,
        }, { status: 400 });
      }
      let pageToken: string | undefined;
      for (let p = 0; p < 20; p++) {
        const res = await drive.files.list({
          q: "trashed=false", fields: "nextPageToken, files(id,name,mimeType)",
          pageSize: 1000, pageToken, spaces: "drive",
        });
        for (const f of res.data.files || []) {
          if (!f.id || f.id === root.id) continue;
          if (f.mimeType === FOLDER_MIME) continue; // on ne supprime que les fichiers
          if (await assertInsideRoot(f.id)) targets.push({ id: f.id, name: f.name || "" });
        }
        pageToken = res.data.nextPageToken || undefined;
        if (!pageToken) break;
      }
    } else {
      const rawIds = Array.isArray(body.ids) ? body.ids as unknown[] : [];
      const ids: string[] = [...new Set<string>(rawIds.map((value) => String(value)).filter((value) => Boolean(value)))];
      if (ids.length === 0) return NextResponse.json({ error: "Aucun élément sélectionné" }, { status: 400 });
      if (ids.length > 100) return NextResponse.json({ error: "100 éléments maximum par opération" }, { status: 400 });
      const validIds: string[] = [];
      for (const id of ids) {
        if (cfg.rootFolderId && id === cfg.rootFolderId) continue;
        if (await assertInsideRoot(id)) validIds.push(id);
      }
      targets = validIds.map((id) => ({ id, name: id }));
      if (targets.length === 0) return NextResponse.json({ error: "Aucun élément du stockage applicatif sélectionné" }, { status: 404 });
    }

    let deleted = 0;
    const failed: { id: string; reason: string }[] = [];
    for (const t of targets) {
      try { await drive.files.delete({ fileId: t.id }); deleted++; }
      catch (e) { failed.push({ id: t.id, reason: friendlyDriveError(e).message }); }
    }

    await logActivity(user.id, user.username, body.all ? "STORAGE_DELETE_ALL" : "STORAGE_DELETE_BATCH",
      `${deleted} fichier(s) supprimé(s)${failed.length ? `, ${failed.length} échec(s)` : ""}`);

    return NextResponse.json({ ok: failed.length === 0, deleted, failed, total: targets.length });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Suppression multiple Google Drive:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
