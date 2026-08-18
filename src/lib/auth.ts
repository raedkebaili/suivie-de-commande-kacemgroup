import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, activityLogs, modificationLogs, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "otp-super-secret-jwt-key-2024");
export type UserPayload = { id: number; username: string; role: string; fullName: string; darkMode: boolean };

export async function hashPassword(p: string) { return bcrypt.hash(p, 10); }
export async function verifyPassword(p: string, h: string) { return bcrypt.compare(p, h); }
export async function createToken(payload: UserPayload) {
  return new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("24h").sign(JWT_SECRET);
}
export async function verifyToken(token: string): Promise<UserPayload | null> {
  try { const { payload } = await jwtVerify(token, JWT_SECRET); return payload as unknown as UserPayload; }
  catch { return null; }
}
export async function getUserFromHeaders(request: Request): Promise<UserPayload | null> {
  const h = request.headers.get("authorization");
  if (!h || !h.startsWith("Bearer ")) return null;
  return verifyToken(h.slice(7));
}
export async function logActivity(uid: number, uname: string, action: string, details?: string) {
  await db.insert(activityLogs).values({ userId: uid, username: uname, action, details: details || null });
}
export async function seedDefaultUser() {
  const ex = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  if (ex.length === 0) {
    const h = await hashPassword("admin123");
    await db.insert(users).values({ username: "admin", passwordHash: h, role: "superadmin", fullName: "Super Administrateur", active: true, darkMode: false });
    console.log("[Seed] admin / admin123");
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
