export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createToken, logActivity, seedDefaultUser } from "@/lib/auth";
import { friendlyDbErrorMessage } from "@/lib/db-error";

export async function POST(request: NextRequest) {
  try {
    // db is synchronous
    await seedDefaultUser();

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Nom d'utilisateur et mot de passe requis" }, { status: 400 });
    }

    const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (rows.length === 0 || !rows[0].active) {
      return NextResponse.json({ error: "Identifiants invalides ou compte désactivé" }, { status: 401 });
    }

    const valid = await verifyPassword(password, rows[0].passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    const payload = {
      id: rows[0].id,
      username: rows[0].username,
      role: rows[0].role,
      fullName: rows[0].fullName,
      darkMode: rows[0].darkMode || false,
    };

    const token = await createToken(payload);

    try { await logActivity(rows[0].id, rows[0].username, "LOGIN", "Connexion"); } catch { /* ok */ }

    return NextResponse.json({ token, user: payload });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: friendlyDbErrorMessage(error) }, { status: 500 });
  }
}
