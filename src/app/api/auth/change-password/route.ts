export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, hashPassword, verifyPassword, logActivity } from "@/lib/auth";
import { passwordPolicyError } from "@/lib/password-policy";
import { friendlyDbErrorMessage } from "@/lib/db-error";

/**
 * POST /api/auth/change-password — CORRECTIF SÉCURITÉ (R2/R10)
 * L'utilisateur authentifié change son mot de passe :
 *   1. le mot de passe actuel est re-vérifié (anti-prise de main sur session) ;
 *   2. le nouveau respecte la politique (longueur, lettre, chiffre) et doit
 *      différer de l'ancien ;
 *   3. mustChangePassword repasse à false.
 * Body : { currentPassword, newPassword, confirmPassword? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const current = String(body.currentPassword || "");
    const next = String(body.newPassword || "");
    const confirm = body.confirmPassword !== undefined ? String(body.confirmPassword) : next;

    if (!current || !next) {
      return NextResponse.json({ error: "Mot de passe actuel et nouveau mot de passe requis" }, { status: 400 });
    }
    if (next !== confirm) {
      return NextResponse.json({ error: "La confirmation ne correspond pas au nouveau mot de passe" }, { status: 400 });
    }
    const policyError = passwordPolicyError(next);
    if (policyError) {
      return NextResponse.json({ error: `Mot de passe trop faible : ${policyError}` }, { status: 400 });
    }
    if (next === current) {
      return NextResponse.json({ error: "Le nouveau mot de passe doit être différent de l'ancien" }, { status: 400 });
    }

    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row || !row.active) return NextResponse.json({ error: "Compte invalide" }, { status: 403 });

    const valid = await verifyPassword(current, row.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 401 });
    }

    await db.update(users)
      .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
      .where(eq(users.id, row.id));

    await logActivity(row.id, row.username, "CHANGE_PASSWORD", "Mot de passe modifié");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: friendlyDbErrorMessage(error) }, { status: 500 });
  }
}
