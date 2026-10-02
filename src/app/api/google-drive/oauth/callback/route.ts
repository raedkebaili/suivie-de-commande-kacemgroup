export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { oauth2 as oauth2Api } from "@googleapis/oauth2";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { buildRedirectUri, ensureRootFolder, getConfig, getCredentials, updateConfig } from "@/lib/google-drive";

/**
 * GET /api/google-drive/oauth/callback
 * URL de redirection déclarée dans Google Cloud.
 *
 * Google renvoie ici un code d'autorisation à usage unique. Le backend
 * l'échange contre un REFRESH TOKEN, qu'il chiffre et conserve côté serveur.
 * Aucun jeton n'est transmis au navigateur.
 *
 * Cette route est appelée par le navigateur après consentement Google : elle
 * ne peut donc pas porter l'en-tête Authorization. La protection repose sur
 * le paramètre `state` généré lors du démarrage du flux (admin authentifié).
 */
function closePage(title: string, message: string, ok: boolean) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${title}</title><style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;max-width:460px;text-align:center}
.icon{font-size:44px}h1{font-size:18px;margin:12px 0 8px}p{font-size:14px;color:#94a3b8;line-height:1.5}
a{display:inline-block;margin-top:18px;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px}
</style></head><body><div class="card"><div class="icon">${ok ? "🟢" : "🔴"}</div>
<h1>${title}</h1><p>${message}</p><a href="/">Retourner à la plateforme</a>
<script>try{if(window.opener){window.opener.postMessage({source:"ordertrack-gdrive",ok:${ok}},"*");setTimeout(()=>window.close(),1200)}}catch(e){}</script>
</div></body></html>`;
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const code = sp.get("code");
  const state = sp.get("state") || "";
  const oauthError = sp.get("error");

  if (oauthError) {
    await updateConfig({ lastError: `Autorisation refusée (${oauthError})` }).catch(() => {});
    return closePage("Connexion annulée", "L'autorisation Google a été refusée ou annulée. Vous pouvez relancer la connexion depuis l'onglet Stockage.", false);
  }
  if (!code) return closePage("Connexion impossible", "Code d'autorisation manquant dans la réponse de Google.", false);

  try {
    const cfg = await getConfig();

    // Vérification du state émis au démarrage du flux
    const expected = (cfg.lastError || "").startsWith("oauth_state:") ? (cfg.lastError || "").slice(12) : null;
    if (!expected || expected !== state) {
      return closePage("Connexion refusée", "La demande de connexion n'a pas pu être vérifiée (session expirée). Relancez la connexion depuis l'onglet Stockage.", false);
    }
    const adminId = parseInt(state.split(".")[0]);

    const { clientId, clientSecret } = await getCredentials(cfg);
    if (!clientId || !clientSecret) {
      return closePage("Configuration incomplète", "Le Client ID et le Client Secret doivent être enregistrés avant la connexion.", false);
    }

    const oauth2 = new OAuth2Client({ clientId, clientSecret, redirectUri: buildRedirectUri(request) });
    const { tokens } = await oauth2.getToken(code);

    if (!tokens.refresh_token) {
      return closePage(
        "Connexion incomplète",
        "Google n'a pas fourni de jeton de rafraîchissement. Révoquez l'accès de l'application dans votre compte Google (Sécurité → Accès des applications), puis relancez la connexion.",
        false,
      );
    }
    oauth2.setCredentials(tokens);

    // Adresse du compte Google connecté (scope userinfo.email)
    let email: string | null = null;
    try {
      const info = await oauth2Api({ version: "v2", auth: oauth2 }).userinfo.get();
      email = info.data.email || null;
    } catch { /* non bloquant */ }

    let adminName: string | null = null;
    if (Number.isFinite(adminId)) {
      const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, adminId)).limit(1);
      adminName = u?.fullName || null;
    }

    const now = new Date().toISOString();
    await updateConfig({
      encryptedRefreshToken: encryptSecret(tokens.refresh_token), // chiffré au repos
      googleAccountEmail: email,
      status: "connected",
      lastError: null,
      connectedAt: now,
      lastSyncAt: now,
      connectedById: Number.isFinite(adminId) ? adminId : null,
      connectedByName: adminName,
    });

    // Dossier racine : réutilisé s'il existe déjà, créé sinon (jamais dupliqué)
    let folderNote = "";
    try {
      const folder = await ensureRootFolder();
      folderNote = ` Dossier de stockage : ${folder.name}.`;
    } catch (e) {
      console.error("Création du dossier racine:", e);
      folderNote = " Le dossier de stockage sera créé à la première utilisation.";
    }

    if (Number.isFinite(adminId)) {
      await logActivity(adminId, adminName || "admin", "STORAGE_CONNECT",
        `Google Drive connecté${email ? ` (${email})` : ""}`).catch(() => {});
    }

    return closePage("Google Drive connecté", `Le stockage est opérationnel${email ? ` avec le compte ${email}` : ""}.${folderNote}`, true);
  } catch (error) {
    console.error("Erreur callback OAuth Google:", error);
    await updateConfig({ status: "disconnected", lastError: "Échec de la connexion Google" }).catch(() => {});
    return closePage("Échec de la connexion", "Google a refusé l'échange du code d'autorisation. Vérifiez que l'URL de redirection déclarée dans Google Cloud correspond exactement à celle affichée dans la plateforme.", false);
  }
}
