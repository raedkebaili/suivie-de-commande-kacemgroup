export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agencies, users, userAgencyAccess } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { hashPassword, logActivity, getUserFromHeaders } from "@/lib/auth";
import { passwordPolicyError } from "@/lib/password-policy";

async function validateAgencyIds(raw: unknown): Promise<number[] | string> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "La liste des agences est invalide";
  const ids = [...new Set(raw.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return "La liste des agences est invalide";
  if (ids.length === 0) return [];
  const activeAgencies = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(and(inArray(agencies.id, ids), eq(agencies.active, true)));
  if (activeAgencies.length !== ids.length) return "Une ou plusieurs agences sont invalides ou inactives";
  return ids;
}

export async function GET(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const data = await db.select({ id: users.id, username: users.username, role: users.role, fullName: users.fullName, active: users.active, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt));
  const userIds = data.map((user) => user.id);
  const accessRows = userIds.length > 0
    ? await db.select({ userId: userAgencyAccess.userId, agencyId: userAgencyAccess.agencyId })
      .from(userAgencyAccess).where(inArray(userAgencyAccess.userId, userIds))
    : [];
  const agencyIdsByUser = new Map<number, number[]>();
  for (const row of accessRows) agencyIdsByUser.set(row.userId, [...(agencyIdsByUser.get(row.userId) || []), row.agencyId]);
  return NextResponse.json({ users: data.map((user) => ({ ...user, agencyIds: agencyIdsByUser.get(user.id) || [] })) });
}

export async function POST(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = await request.json();
  const { username, password, role, fullName } = body;
  if (!username || !password || !role || !fullName) return NextResponse.json({ error: "Tous les champs requis" }, { status: 400 });
  const policyError = passwordPolicyError(String(password));
  if (policyError) return NextResponse.json({ error: `Mot de passe trop faible : ${policyError}` }, { status: 400 });
  const agencyIds = await validateAgencyIds(body.agencyIds);
  if (typeof agencyIds === "string") return NextResponse.json({ error: agencyIds }, { status: 400 });
  const ex = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (ex.length > 0) return NextResponse.json({ error: "Nom d'utilisateur existe déjà" }, { status: 400 });

  const created = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ username, passwordHash: await hashPassword(password), role, fullName, active: true, mustChangePassword: true }).returning({ id: users.id, username: users.username, role: users.role, fullName: users.fullName, active: users.active, createdAt: users.createdAt });
    if (agencyIds.length > 0) await tx.insert(userAgencyAccess).values(agencyIds.map((agencyId) => ({ userId: user.id, agencyId })));
    return user;
  });
  await logActivity(u.id, u.username, "CREATE_USER", `Utilisateur: ${username}`);
  return NextResponse.json({ user: { ...created, agencyIds } }, { status: 201 });
}
