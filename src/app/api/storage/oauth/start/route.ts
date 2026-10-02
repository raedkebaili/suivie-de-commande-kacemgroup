export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getUserFromHeaders } from "@/lib/auth";
import { DRIVE_SCOPES, buildRedirectUri, makeOAuthClient, updateConfig } from "@/lib/google-drive";

/**
 * POST /api/storage/oauth/start — SUPERADMIN UNIQUEMENT
 * Prépare l'URL de consentement Google. Le frontend y redirige l'administrateur.
 *
 * access_type=offline + prompt=consent garantissent l'obtention d'un
 * REFRESH TOKEN (connexion persistante, aucun jeton à copier manuellement).
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const client = await makeOAuthClient(request);
    if (!client) {
      return NextResponse.json({
        error: "Identifiants OAuth manquants : enregistrez d'abord le Client ID et le Client Secret (étape 4).",
      }, { status: 400 });
    }

    // State signé : protège le callback contre les requêtes forgées
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = `${user.id}.${nonce}`;
    await updateConfig({ lastError: `oauth_state:${state}` });

    const url = client.generateAuthUrl({
      access_type: "offline",      // indispensable pour recevoir un refresh token
      prompt: "consent",           // force l'émission d'un nouveau refresh token
      scope: DRIVE_SCOPES,
      include_granted_scopes: true,
      state,
    });

    return NextResponse.json({ url, redirectUri: buildRedirectUri(request) });
  } catch (error) {
    console.error("Erreur démarrage OAuth Google:", error);
    return NextResponse.json({ error: "Impossible de démarrer la connexion Google" }, { status: 500 });
  }
}
