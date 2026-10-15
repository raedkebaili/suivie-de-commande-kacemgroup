export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agencies, users, userAgencyAccess } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { hashPassword, logActivity, getUserFromHeaders } from "@/lib/auth";
import { passwordPolicyError } from "@/lib/password-policy";

const ALLOWED_ROLES = ["superadmin", "commercial", "technique", "planification", "consultant_prod", "recouvrement", "acces_agence", "gerant"] as const;

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
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  const policyError = passwordPolicyError(String(password));
  if (policyError) return NextResponse.json({ error: `Mot de passe trop faible : ${policyError}` }, { status: 400 });
  const requestedAgencyIds = await validateAgencyIds(body.agencyIds);
  if (typeof requestedAgencyIds === "string") return NextResponse.json({ error: requestedAgencyIds }, { status: 400 });
  if (role === "acces_agence" && requestedAgencyIds.length === 0) {
    return NextResponse.json({ error: "Sélectionnez au moins une agence pour le rôle Accès agence" }, { status: 400 });
  }
  const agencyIds = role === "acces_agence" ? requestedAgencyIds : [];
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

export async function DELETE(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  let body: { confirmation?: unknown } = {};
  try { body = await request.json(); } catch { /* confirmation is checked below */ }
  if (body.confirmation !== "SUPPRIMER TOUS LES AUTRES UTILISATEURS") {
    return NextResponse.json({ error: "Confirmation invalide" }, { status: 400 });
  }

  const deleted = await db.transaction(async (tx) => {
    // Le compte connecté est conservé pour éviter de verrouiller la plateforme.
    // Les références historiques sont neutralisées avant la suppression pour
    // respecter les contraintes FK des commandes, usines et journaux.
    await tx.execute(sql`UPDATE orders SET created_by = NULL WHERE created_by <> ${u.id}`);
    await tx.execute(sql`UPDATE factories SET responsable_id = NULL WHERE responsable_id <> ${u.id}`);
    await tx.execute(sql`UPDATE activity_logs SET user_id = NULL WHERE user_id <> ${u.id}`);
    await tx.execute(sql`UPDATE modification_logs SET user_id = NULL WHERE user_id <> ${u.id}`);
    await tx.execute(sql`DELETE FROM notifications WHERE user_id <> ${u.id}`);
    return tx.delete(users).where(sql`${users.id} <> ${u.id}`).returning({ id: users.id });
  });

  await logActivity(u.id, u.username, "DELETE_ALL_USERS", `${deleted.length} utilisateurs supprimés (compte administrateur conservé)`);
  return NextResponse.json({ deleted: deleted.length, preserved: u.username });
}
