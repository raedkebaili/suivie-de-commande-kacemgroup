/**
 * Chiffrement des secrets au repos (AES-256-GCM).
 *
 * Utilisé pour le client secret OAuth et le refresh token Google Drive :
 * ces valeurs ne doivent jamais être stockées en clair, ni renvoyées au
 * frontend, ni écrites dans les journaux.
 *
 * La clé provient de APP_ENCRYPTION_KEY (32 octets en hexadécimal).
 * À défaut, elle est dérivée de JWT_SECRET afin que l'application reste
 * fonctionnelle, avec un avertissement au démarrage.
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  if (raw && raw.length >= 32) return crypto.createHash("sha256").update(raw).digest();
  const fallback = process.env.JWT_SECRET;
  if (!fallback) {
    throw new Error("Chiffrement indisponible : définissez APP_ENCRYPTION_KEY (64 caractères hexadécimaux) dans .env");
  }
  return crypto.createHash("sha256").update(`storage:${fallback}`).digest();
}

/** Chiffre une valeur ; retourne "v1:iv:tag:data" en base64 */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/** Déchiffre une valeur produite par encryptSecret ; null si invalide */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const parts = payload.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") return null;
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(parts[1], "base64"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Masque une valeur sensible pour l'affichage (ex. "1234…cdef") */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 10) return "••••••";
  return `${value.slice(0, 6)}••••${value.slice(-4)}`;
}
