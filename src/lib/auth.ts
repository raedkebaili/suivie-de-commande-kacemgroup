// ── Authentification & autorisation — CORRECTIFS SÉCURITÉ ─────────────
// R1  : le secret JWT ne possède PLUS de valeur de repli codée en dur.
//       JWT_SECRET est exigé (vérification paresseuse à l'usage — le build
//       Next.js n'exécute jamais ce code, la vérification a donc lieu au
//       runtime uniquement).
// R8  : la durée du jeton passe de 24 h à 12 h.
// R9  : chaque appel d'API re-valide l'utilisateur EN BASE (compte actif,
//       rôle actuel) : désactiver ou rétrograder un compte prend effet
//       immédiatement, sans attendre l'expiration du jeton.
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, activityLogs, modificationLogs, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";

const TOKEN_TTL = "12h";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET manquant ou trop court (32 caractères minimum). " +
      "Définissez-le dans .env (ex. node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\")."
    );
  }
  return new TextEncoder().encode(secret);
}

export type UserPayload = { id: number; username: string; role: string; fullName: string; darkMode: boolean };

export async function hashPassword(p: string) { return bcrypt.hash(p, 12); }
export async function verifyPassword(p: string, h: string) { return bcrypt.compare(p, h); }

export async function createToken(payload: UserPayload) {
  return new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(TOKEN_TTL).sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<UserPayload | null> {
  try { const { payload } = await jwtVerify(token, getJwtSecret()); return payload as unknown as UserPayload; }
  catch { return null; }
}

export async function getUserFromHeaders(request: Request): Promise<UserPayload | null> {
  const h = request.headers.get("authorization");
  if (!h || !h.startsWith("Bearer ")) return null;
  const payload = await verifyToken(h.slice(7));
  if (!payload) return null;
  // R9 — re-validation systématique en base : jeton révoqué de fait si le
  // compte est désactivé ou supprimé ; le rôle est TOUJOURS celui de la base.
  try {
    const [row] = await db
      .select({ id: users.id, username: users.username, role: users.role, fullName: users.fullName, darkMode: users.darkMode, active: users.active })
      .from(users).where(eq(users.id, payload.id)).limit(1);
    if (!row || !row.active) return null;
    return { id: row.id, username: row.username, role: row.role, fullName: row.fullName, darkMode: row.darkMode };
  } catch (error) {
    // Base indisponible : refuser par prudence plutôt qu'authentifier à l'aveugle.
    console.error("[auth] Re-validation utilisateur impossible:", error);
    return null;
  }
}

export async function logActivity(uid: number, uname: string, action: string, details?: string) {
  await db.insert(activityLogs).values({ userId: uid, username: uname, action, details: details || null });
}

/** Mot de passe initial du compte admin semé — changement OBLIGATOIRE (R2). */
export const DEFAULT_ADMIN_PASSWORD = "Admin@2024";

export async function seedDefaultUser() {
  const ex = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  if (ex.length === 0) {
    const h = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    // mustChangePassword = true : connexion possible uniquement pour choisir
    // un nouveau mot de passe unique, aucun accès aux modules avant cela.
    await db.insert(users).values({ username: "admin", passwordHash: h, role: "superadmin", fullName: "Super Administrateur", active: true, darkMode: false, mustChangePassword: true });
    console.log("[Seed] Compte admin initialisé — changement de mot de passe obligatoire à la 1re connexion");
  }
}

export async function notifyUser(userId: number, type: string, title: string, message: string, orderId?: number) {
  await db.insert(notifications).values({ userId, type, title, message, orderId: orderId || null, read: false });
}

export async function logModification(orderId: number, userId: number, username: string, field: string, oldValue: string | null, newValue: string | null) {
  await db.insert(modificationLogs).values({ orderId, userId, username, field, oldValue, newValue });
}

export async function notifyRole(role: string, type: string, title: string, message: string, orderId?: number) {
  const us = await db.select().from(users).where(eq(users.role, role));
  for (const u of us) {
    await notifyUser(u.id, type, title, message, orderId);
  }
}
