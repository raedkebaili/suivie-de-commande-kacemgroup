/**
 * Service Google Drive — SERVEUR UNIQUEMENT.
 *
 * Stockage CENTRALISÉ : un seul compte Google, configuré par l'administrateur,
 * sert d'espace de stockage à toute la plateforme. Les utilisateurs ne
 * communiquent jamais directement avec Google : tout passe par le backend,
 * qui applique l'authentification et les autorisations existantes.
 *
 * Sécurité :
 *  - client secret et refresh token CHIFFRÉS en base (src/lib/crypto.ts) ;
 *  - jamais renvoyés au frontend, jamais journalisés ;
 *  - access tokens obtenus automatiquement depuis le refresh token.
 *
 * Scope : https://www.googleapis.com/auth/drive.file — le plus restrictif
 * permettant de créer, lister, lire, renommer, déplacer et supprimer les
 * fichiers et dossiers CRÉÉS PAR L'APPLICATION. L'application n'accède donc
 * jamais au reste du Drive personnel du compte.
 */
import { drive as driveApi } from "@googleapis/drive";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import { db } from "@/db";
import { storageConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

export const DEFAULT_ROOT_FOLDER = "ORDERTRACK STORAGE";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export type StorageConfigRow = typeof storageConfig.$inferSelect;

/** Charge (ou crée) l'unique ligne de configuration */
export async function getConfig(): Promise<StorageConfigRow> {
  const [row] = await db.select().from(storageConfig).limit(1);
  if (row) return row;
  const [created] = await db.insert(storageConfig).values({
    provider: "google_drive",
    rootFolderName: DEFAULT_ROOT_FOLDER,
    status: "disconnected",
  }).returning();
  return created;
}

export async function updateConfig(patch: Partial<typeof storageConfig.$inferInsert>) {
  const cfg = await getConfig();
  const [updated] = await db.update(storageConfig)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(storageConfig.id, cfg.id))
    .returning();
  return updated;
}

/** Identifiants OAuth effectifs : base de données d'abord, variables d'env en secours */
export async function getCredentials(cfg?: StorageConfigRow) {
  const c = cfg || (await getConfig());
  const clientId = c.clientId || process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = decryptSecret(c.encryptedClientSecret) || process.env.GOOGLE_CLIENT_SECRET || "";
  return { clientId, clientSecret, source: c.clientId ? "database" : (process.env.GOOGLE_CLIENT_ID ? "env" : "none") };
}

/** URL de redirection OAuth, déduite automatiquement de la requête */
export function buildRedirectUri(request?: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  let origin = process.env.NEXT_PUBLIC_APP_URL || "";
  if (request) {
    try {
      const u = new URL(request.url);
      const proto = request.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
      const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || u.host;
      if (host) origin = `${proto}://${host}`;
    } catch { /* origine par défaut */ }
  }
  if (!origin) origin = "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/api/google-drive/oauth/callback`;
}

export async function makeOAuthClient(request?: Request): Promise<OAuth2Client | null> {
  const cfg = await getConfig();
  const { clientId, clientSecret } = await getCredentials(cfg);
  if (!clientId || !clientSecret) return null;
  return new OAuth2Client({ clientId, clientSecret, redirectUri: buildRedirectUri(request) });
}

export class DriveNotConfiguredError extends Error {
  constructor(message = "Google Drive n'est pas configuré. Un administrateur doit connecter le stockage.") {
    super(message);
    this.name = "DriveNotConfiguredError";
  }
}

/**
 * Client Drive authentifié avec le refresh token central.
 * L'access token est renouvelé automatiquement par la librairie Google.
 */
export async function getDriveClient() {
  const cfg = await getConfig();
  const { clientId, clientSecret } = await getCredentials(cfg);
  const refreshToken = decryptSecret(cfg.encryptedRefreshToken);
  if (!clientId || !clientSecret) throw new DriveNotConfiguredError();
  if (!refreshToken) throw new DriveNotConfiguredError("Google Drive n'est pas connecté. Un administrateur doit lancer la connexion.");

  const auth = new OAuth2Client({ clientId, clientSecret, redirectUri: buildRedirectUri() });
  auth.setCredentials({ refresh_token: refreshToken });
  // Si Google renvoie un nouveau refresh token, on le conserve (chiffré)
  auth.on("tokens", (tokens) => {
    if (tokens.refresh_token) {
      updateConfig({ encryptedRefreshToken: encryptSecret(tokens.refresh_token) }).catch(() => {});
    }
  });
  return { drive: driveApi({ version: "v3", auth }), auth, cfg };
}

/**
 * Dossier racine : réutilisé s'il existe, créé sinon.
 * Jamais recréé à chaque connexion (l'identifiant est mémorisé en base).
 */
export async function ensureRootFolder(): Promise<{ id: string; name: string }> {
  const { drive, cfg } = await getDriveClient();
  const name = cfg.rootFolderName || DEFAULT_ROOT_FOLDER;

  if (cfg.rootFolderId) {
    try {
      const existing = await drive.files.get({ fileId: cfg.rootFolderId, fields: "id,name,trashed" });
      if (existing.data.id && !existing.data.trashed) {
        return { id: existing.data.id, name: existing.data.name || name };
      }
    } catch { /* dossier supprimé côté Drive : on en recrée un */ }
  }

  // Recherche parmi les dossiers visibles par l'application (scope drive.file)
  const found = await drive.files.list({
    q: `mimeType='${FOLDER_MIME}' and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
    fields: "files(id,name)", pageSize: 10, spaces: "drive",
  });
  if (found.data.files && found.data.files.length > 0 && found.data.files[0].id) {
    const f = found.data.files[0];
    await updateConfig({ rootFolderId: f.id! });
    return { id: f.id!, name: f.name || name };
  }

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME },
    fields: "id,name",
  });
  await updateConfig({ rootFolderId: created.data.id! });
  return { id: created.data.id!, name: created.data.name || name };
}

/** Traduit les erreurs Google en messages compréhensibles (sans détail technique) */
export function friendlyDriveError(error: unknown): { message: string; status: number } {
  if (error instanceof DriveNotConfiguredError) return { message: error.message, status: 409 };
  const e = error as { code?: number | string; message?: string; errors?: { reason?: string }[] };
  const code = Number(e?.code);
  const reason = e?.errors?.[0]?.reason || "";
  const msg = String(e?.message || "");

  if (msg.includes("invalid_grant") || reason === "invalid_grant") {
    return { message: "Autorisation Google expirée ou révoquée. Un administrateur doit reconnecter Google Drive.", status: 401 };
  }
  if (code === 401) return { message: "Autorisation Google expirée. Reconnectez Google Drive.", status: 401 };
  if (code === 403 && (reason.includes("quota") || msg.toLowerCase().includes("quota"))) {
    return { message: "Quota Google Drive dépassé. Réessayez plus tard ou libérez de l'espace.", status: 429 };
  }
  if (code === 403) return { message: "Permission refusée par Google Drive pour cette opération.", status: 403 };
  if (code === 404) return { message: "Fichier ou dossier introuvable sur Google Drive.", status: 404 };
  if (code === 429) return { message: "Trop de requêtes vers Google Drive. Réessayez dans quelques instants.", status: 429 };
  if (msg.includes("ENOTFOUND") || msg.includes("ETIMEDOUT") || msg.includes("ECONNREFUSED")) {
    return { message: "Impossible de joindre Google Drive (erreur réseau). Vérifiez la connexion du serveur.", status: 503 };
  }
  return { message: "Erreur Google Drive. Consultez les journaux du serveur pour le détail.", status: 500 };
}

/** Convertit un Buffer en flux lisible pour l'upload Drive */
export function bufferToStream(buffer: Buffer): Readable {
  return Readable.from(buffer);
}

/** Vérifie qu'un fichier appartient bien à l'arborescence du dossier racine */
export async function assertInsideRoot(fileId: string): Promise<boolean> {
  const { drive, cfg } = await getDriveClient();
  if (!cfg.rootFolderId) return false;
  let current = fileId;
  for (let depth = 0; depth < 12; depth++) {
    const res = await drive.files.get({ fileId: current, fields: "id,parents" });
    const parents = res.data.parents || [];
    if (parents.length === 0) return false;
    if (parents.includes(cfg.rootFolderId)) return true;
    if (current === cfg.rootFolderId) return true;
    current = parents[0];
  }
  return false;
}
