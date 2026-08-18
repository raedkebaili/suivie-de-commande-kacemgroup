export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { hashPassword, logActivity, getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  
  const data = await db.select({ id: users.id, username: users.username, role: users.role, fullName: users.fullName, active: users.active, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt));
  return NextResponse.json({ users: data });
}

export async function POST(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  
  const { username, password, role, fullName } = await request.json();
  if (!username || !password || !role || !fullName) return NextResponse.json({ error: "Tous les champs requis" }, { status: 400 });
  const ex = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (ex.length > 0) return NextResponse.json({ error: "Nom d'utilisateur existe déjà" }, { status: 400 });
  const [created] = await db.insert(users).values({ username, passwordHash: await hashPassword(password), role, fullName, active: true }).returning({ id: users.id, username: users.username, role: users.role, fullName: users.fullName, active: users.active, createdAt: users.createdAt });
  await logActivity(u.id, u.username, "CREATE_USER", `Utilisateur: ${username}`);
  return NextResponse.json({ user: created }, { status: 201 });
}
