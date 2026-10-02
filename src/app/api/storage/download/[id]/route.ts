export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity, verifyToken } from "@/lib/auth";
import { friendlyDriveError, getDriveClient } from "@/lib/google-drive";

/**
 * Authentifie la requête via l'en-tête Authorization, ou à défaut via le
 * paramètre `token` — nécessaire pour l'aperçu PDF intégré (<iframe>), qui
 * ne permet pas d'ajouter d'en-tête. Le jeton reste un JWT de la plateforme
 * vérifié normalement : aucun accès anonyme n'est ouvert.
 */
async function authenticate(request: NextRequest) {
  const fromHeader = await getUserFromHeaders(request);
  if (fromHeader) return fromHeader;
  const token = new URL(request.url).searchParams.get("token");
  return token ? verifyToken(token) : null;
}

/**
 * GET /api/storage/download/[id]?mode=inline|attachment
 * Le backend récupère le fichier depuis Google Drive et le relaie au client.
 *
 * Les fichiers ne sont JAMAIS rendus publics sur Drive : la visualisation et
 * le téléchargement passent par cette route authentifiée.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticate(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Identifiant requis" }, { status: 400 });
  const mode = new URL(request.url).searchParams.get("mode") === "inline" ? "inline" : "attachment";

  try {
    const { drive } = await getDriveClient();
    const meta = await drive.files.get({ fileId: id, fields: "id,name,mimeType,size" });
    const res = await drive.files.get({ fileId: id, alt: "media" }, { responseType: "arraybuffer" });

    const buffer = Buffer.from(res.data as ArrayBuffer);
    const filename = (meta.data.name || "document.pdf").replace(/"/g, "");

    await logActivity(user.id, user.username, "STORAGE_DOWNLOAD", `Fichier: ${filename}`).catch(() => {});

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": meta.data.mimeType || "application/pdf",
        "Content-Disposition": `${mode}; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Téléchargement Google Drive:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
