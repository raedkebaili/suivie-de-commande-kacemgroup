export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { encryptSecret, maskSecret } from "@/lib/crypto";
import { buildRedirectUri, getConfig, getCredentials, updateConfig, DEFAULT_ROOT_FOLDER } from "@/lib/google-drive";

/**
 * GET /api/storage/config
 * État de la configuration du stockage (sans AUCUN secret).
 * Lecture : tout utilisateur authentifié (l'onglet Stockage a besoin de
 * savoir si le service est disponible) ; les champs sensibles ne sont
 * jamais inclus — seul un masque indicatif est renvoyé à l'administrateur.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const isAdmin = user.role === "superadmin";

  try {
    const cfg = await getConfig();
    const { clientId, source } = await getCredentials(cfg);

    return NextResponse.json({
      status: cfg.status,                       // disconnected | connected | expired
      connected: cfg.status === "connected",
      googleAccountEmail: cfg.googleAccountEmail,
      rootFolderName: cfg.rootFolderName || DEFAULT_ROOT_FOLDER,
      rootFolderConfigured: !!cfg.rootFolderId,
      connectedAt: cfg.connectedAt,
      lastSyncAt: cfg.lastSyncAt,
      connectedByName: cfg.connectedByName,
      lastError: cfg.lastError,
      credentialsConfigured: !!clientId,
      // Informations réservées à l'administrateur (jamais de secret en clair)
      admin: isAdmin ? {
        clientIdMasked: maskSecret(clientId),
        credentialsSource: source,             // database | env | none
        redirectUri: buildRedirectUri(request),
      } : null,
      isAdmin,
    });
  } catch (error) {
    console.error("Erreur lecture configuration stockage:", error);
    return NextResponse.json({ error: "Erreur lors de la lecture de la configuration" }, { status: 500 });
  }
}

/**
 * PUT /api/storage/config — SUPERADMIN UNIQUEMENT
 * Enregistre les identifiants OAuth (client ID / client secret) et le nom
 * du dossier racine. Le secret est chiffré avant stockage et n'est jamais relu
 * par le frontend.
 */
export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const body = await request.json();
    const patch: Record<string, unknown> = {};

    if (body.clientId !== undefined) {
      const v = String(body.clientId || "").trim();
      if (!v) return NextResponse.json({ error: "Client ID requis" }, { status: 400 });
      if (!v.includes(".apps.googleusercontent.com")) {
        return NextResponse.json({
          error: "Client ID invalide : il doit se terminer par .apps.googleusercontent.com",
        }, { status: 400 });
      }
      patch.clientId = v;
    }
    if (body.clientSecret !== undefined) {
      const v = String(body.clientSecret || "").trim();
      if (!v) return NextResponse.json({ error: "Client Secret requis" }, { status: 400 });
      patch.encryptedClientSecret = encryptSecret(v); // chiffré au repos
    }
    if (body.rootFolderName !== undefined) {
      const v = String(body.rootFolderName || "").trim() || DEFAULT_ROOT_FOLDER;
      patch.rootFolderName = v;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Aucune donnée à enregistrer" }, { status: 400 });
    }

    await updateConfig(patch);
    // Les valeurs sensibles ne sont jamais journalisées
    await logActivity(user.id, user.username, "STORAGE_CONFIG", "Identifiants Google Drive enregistrés");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erreur enregistrement configuration stockage:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement de la configuration" }, { status: 500 });
  }
}
