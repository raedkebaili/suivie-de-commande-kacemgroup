export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { bufferToStream, ensureRootFolder, friendlyDriveError, getDriveClient, updateConfig } from "@/lib/google-drive";

/**
 * POST /api/storage/test — SUPERADMIN UNIQUEMENT
 * Teste réellement : accès au compte, accès au dossier, LECTURE et ÉCRITURE.
 * Le fichier de test est supprimé immédiatement après vérification.
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const checks: { step: string; ok: boolean; detail?: string }[] = [];

  try {
    // 1) Authentification / accès au compte
    const { drive } = await getDriveClient();
    const about = await drive.about.get({ fields: "user(emailAddress,displayName),storageQuota" });
    const email = about.data.user?.emailAddress || null;
    checks.push({ step: "Accès au compte Google", ok: true, detail: email || undefined });

    // 2) Dossier racine
    const folder = await ensureRootFolder();
    checks.push({ step: "Accès au dossier de stockage", ok: true, detail: folder.name });

    // 3) Lecture (listing)
    const list = await drive.files.list({
      q: `'${folder.id}' in parents and trashed=false`,
      fields: "files(id)", pageSize: 1, spaces: "drive",
    });
    checks.push({ step: "Lecture", ok: true, detail: `${list.data.files?.length ?? 0} élément(s) visible(s)` });

    // 4) Écriture puis suppression du fichier de test
    const created = await drive.files.create({
      requestBody: { name: `.ordertrack-test-${Date.now()}.txt`, parents: [folder.id] },
      media: { mimeType: "text/plain", body: bufferToStream(Buffer.from("test ordertrack")) },
      fields: "id",
    });
    checks.push({ step: "Écriture", ok: true });
    if (created.data.id) {
      await drive.files.delete({ fileId: created.data.id });
      checks.push({ step: "Suppression", ok: true });
    }

    const quota = about.data.storageQuota;
    await updateConfig({ status: "connected", lastError: null, lastSyncAt: new Date().toISOString(), googleAccountEmail: email });
    await logActivity(user.id, user.username, "STORAGE_TEST", "Test de connexion Google Drive réussi");

    return NextResponse.json({
      ok: true,
      message: "Connexion fonctionnelle",
      account: email,
      folder: folder.name,
      checks,
      quota: quota ? { limit: quota.limit ?? null, usage: quota.usage ?? null, usageInDrive: quota.usageInDrive ?? null } : null,
    });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Test Google Drive:", error);
    await updateConfig({ status: status === 401 ? "expired" : "disconnected", lastError: message }).catch(() => {});
    return NextResponse.json({ ok: false, error: message, checks }, { status });
  }
}
