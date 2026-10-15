export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agencies, users, userAgencyAccess } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id } = await params;
  const userId = parseInt(id, 10);
  if (!Number.isInteger(userId)) return NextResponse.json({ error: "Identifiant utilisateur invalide" }, { status: 400 });
  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.username !== undefined) updates.username = body.username;
  if (body.role !== undefined) {
    if (!ALLOWED_ROLES.includes(body.role as (typeof ALLOWED_ROLES)[number])) return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
    updates.role = body.role;
  }
  if (body.fullName !== undefined) updates.fullName = body.fullName;
  if (body.active !== undefined) updates.active = body.active;
  if (body.password) {
    const policyError = passwordPolicyError(String(body.password));
    if (policyError) return NextResponse.json({ error: `Mot de passe trop faible : ${policyError}` }, { status: 400 });
    updates.passwordHash = await hashPassword(body.password);
    updates.mustChangePassword = true;
  }
  const [current] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!current) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  const nextRole = body.role ?? current.role;
  const requestedAgencyIds = await validateAgencyIds(body.agencyIds);
  if (typeof requestedAgencyIds === "string") return NextResponse.json({ error: requestedAgencyIds }, { status: 400 });
  if (nextRole === "acces_agence" && requestedAgencyIds.length === 0) {
    return NextResponse.json({ error: "Sélectionnez au moins une agence pour le rôle Accès agence" }, { status: 400 });
  }
  // Les affectations sont exclusivement celles du rôle Accès agence.
  // Changer un utilisateur vers un autre rôle retire donc ses restrictions.
  const agencyIds = nextRole === "acces_agence" ? requestedAgencyIds : [];

  const updated = await db.transaction(async (tx) => {
    const [user] = await tx.update(users).set(updates).where(eq(users.id, userId)).returning({ id: users.id, username: users.username, role: users.role, fullName: users.fullName, active: users.active, createdAt: users.createdAt });
    if (!user) return null;
    await tx.delete(userAgencyAccess).where(eq(userAgencyAccess.userId, userId));
    if (agencyIds.length > 0) await tx.insert(userAgencyAccess).values(agencyIds.map((agencyId) => ({ userId, agencyId })));
    return user;
  });
  if (!updated) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  await logActivity(u.id, u.username, "UPDATE_USER", `Utilisateur: ${updated.username}`);
  const assigned = agencyIds !== undefined
    ? agencyIds
    : (await db.select({ agencyId: userAgencyAccess.agencyId }).from(userAgencyAccess).where(eq(userAgencyAccess.userId, userId))).map((row) => row.agencyId);
  return NextResponse.json({ user: { ...updated, agencyIds: assigned } });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id } = await params;
  const userId = parseInt(id, 10);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  if (user.role === "superadmin") { const admins = await db.select().from(users).where(eq(users.role, "superadmin")); if (admins.length <= 1) return NextResponse.json({ error: "Impossible de supprimer le dernier superadmin" }, { status: 400 }); }
  await db.delete(users).where(eq(users.id, userId));
  await logActivity(u.id, u.username, "DELETE_USER", `Utilisateur: ${user.username}`);
  return NextResponse.json({ success: true });
}
