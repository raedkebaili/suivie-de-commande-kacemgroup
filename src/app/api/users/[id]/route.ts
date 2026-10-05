export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, logActivity, getUserFromHeaders } from "@/lib/auth";
import { passwordPolicyError } from "@/lib/password-policy";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id } = await params;
  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.username !== undefined) updates.username = body.username;
  if (body.role !== undefined) updates.role = body.role;
  if (body.fullName !== undefined) updates.fullName = body.fullName;
  if (body.active !== undefined) updates.active = body.active;
  if (body.password) {
    // CORRECTIF SÉCURITÉ (R10) : politique de mot de passe + (R2) le
    // bénéficiaire devra redéfinir son mot de passe à la prochaine connexion.
    const policyError = passwordPolicyError(String(body.password));
    if (policyError) return NextResponse.json({ error: `Mot de passe trop faible : ${policyError}` }, { status: 400 });
    updates.passwordHash = await hashPassword(body.password);
    updates.mustChangePassword = true;
  }
  const [updated] = await db.update(users).set(updates).where(eq(users.id, parseInt(id))).returning({ id: users.id, username: users.username, role: users.role, fullName: users.fullName, active: users.active, createdAt: users.createdAt });
  if (!updated) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  await logActivity(u.id, u.username, "UPDATE_USER", `Utilisateur: ${updated.username}`);
  return NextResponse.json({ user: updated });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUserFromHeaders(request);
  if (!u || u.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id } = await params;
  const [user] = await db.select().from(users).where(eq(users.id, parseInt(id))).limit(1);
  if (!user) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  if (user.role === "superadmin") { const admins = await db.select().from(users).where(eq(users.role, "superadmin")); if (admins.length <= 1) return NextResponse.json({ error: "Impossible de supprimer le dernier superadmin" }, { status: 400 }); }
  await db.delete(users).where(eq(users.id, parseInt(id)));
  await logActivity(u.id, u.username, "DELETE_USER", `Utilisateur: ${user.username}`);
  return NextResponse.json({ success: true });
}
