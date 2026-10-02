export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { getConfig, updateConfig } from "@/lib/google-drive";

/**
 * POST /api/storage/disconnect — SUPERADMIN UNIQUEMENT
 * Supprime l'autorisation entre la plateforme et Google Drive.
 *
 * IMPORTANT : AUCUN fichier n'est supprimé sur Google Drive. On efface
 * uniquement le refresh token. L'identifiant du dossier racine est conservé
 * afin qu'une reconnexion retrouve la même arborescence sans rien recréer.
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const cfg = await getConfig();
    await updateConfig({
      encryptedRefreshToken: null,   // seule l'autorisation est révoquée côté plateforme
      status: "disconnected",
      lastError: null,
      googleAccountEmail: cfg.googleAccountEmail, // conservé pour information
      // rootFolderId volontairement CONSERVÉ : reconnexion sans recréation
    });
    await logActivity(user.id, user.username, "STORAGE_DISCONNECT", "Google Drive déconnecté (fichiers conservés)");
    return NextResponse.json({
      ok: true,
      message: "Google Drive déconnecté. Les fichiers restent dans Google Drive ; seule la connexion entre la plateforme et Google Drive a été supprimée.",
    });
  } catch (error) {
    console.error("Erreur déconnexion Google Drive:", error);
    return NextResponse.json({ error: "Erreur lors de la déconnexion" }, { status: 500 });
  }
}
