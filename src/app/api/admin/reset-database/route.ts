import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getUserFromHeaders, hashPassword, verifyPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CONFIRMATION_TEXT = "REINITIALISER";

export async function POST(request: NextRequest) {
  const authUser = await getUserFromHeaders(request);
  if (!authUser || authUser.role !== "superadmin") {
    return NextResponse.json({ error: "Accès réservé au Super Administrateur" }, { status: 403 });
  }

  let body: { password?: string; confirmation?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  if (body.confirmation !== CONFIRMATION_TEXT) {
    return NextResponse.json(
      { error: `Saisissez exactement ${CONFIRMATION_TEXT} pour confirmer` },
      { status: 400 },
    );
  }

  if (!body.password) {
    return NextResponse.json({ error: "Mot de passe administrateur requis" }, { status: 400 });
  }

  const [currentAdmin] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!currentAdmin || !currentAdmin.active || currentAdmin.role !== "superadmin") {
    return NextResponse.json({ error: "Compte administrateur invalide" }, { status: 403 });
  }

  const passwordValid = await verifyPassword(body.password, currentAdmin.passwordHash);
  if (!passwordValid) {
    return NextResponse.json({ error: "Mot de passe administrateur incorrect" }, { status: 401 });
  }

  try {
    const defaultPasswordHash = await hashPassword("admin123");

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`
        TRUNCATE TABLE
          notifications,
          modification_logs,
          activity_logs,
          expedition_batches,
          production_batches,
          item_technical_components,
          order_items,
          orders,
          matieres,
          material_categories,
          tech_library,
          article_library,
          production_unit_lib,
          clients,
          agencies,
          users
        RESTART IDENTITY CASCADE
      `));

      await tx.insert(users).values({
        username: "admin",
        passwordHash: defaultPasswordHash,
        role: "superadmin",
        fullName: "Super Administrateur",
        active: true,
        darkMode: false,
      });
    });

    return NextResponse.json({
      ok: true,
      message: "Base réinitialisée avec succès",
      credentials: { username: "admin", password: "admin123" },
    });
  } catch (error) {
    console.error("Database reset error:", error);
    return NextResponse.json(
      { error: "Échec du formatage. Aucune donnée n'a été partiellement supprimée." },
      { status: 500 },
    );
  }
}
