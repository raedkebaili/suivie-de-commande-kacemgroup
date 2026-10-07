import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { orderCounters, users } from "@/db/schema";
import { getUserFromHeaders, verifyPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { buildOrderResetSql, ORDER_COUNTER_TABLE, ORDER_RESET_TABLES, PRESERVED_REFERENCE_TABLES } from "@/lib/admin-reset-scope";

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
      { error: `Saisissez exactement ${CONFIRMATION_TEXT} pour confirmer le reset des commandes` },
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
    const currentYear = new Date().getFullYear();
    await db.transaction(async (tx) => {
      // CASCADE supprime uniquement les dépendances des commandes et études
      // (articles, lots, planning, notifications et documents associés).
      await tx.execute(sql.raw(buildOrderResetSql()));
      await tx.execute(sql.raw(`TRUNCATE TABLE ${ORDER_COUNTER_TABLE} RESTART IDENTITY`));
      // Une ligne à zéro rend explicite l'état initial du compteur courant.
      await tx.insert(orderCounters).values({ year: currentYear, lastNumber: 0 });
    });

    return NextResponse.json({
      ok: true,
      message: "Commandes et études réinitialisées. Les matières, clients et agences ont été conservés.",
      preserved: [...PRESERVED_REFERENCE_TABLES],
      reset: [...ORDER_RESET_TABLES, ORDER_COUNTER_TABLE],
      nextOrderNumber: `1/${currentYear}`,
    });
  } catch (error) {
    console.error("Orders/studies reset error:", error);
    return NextResponse.json(
      { error: "Échec de la réinitialisation. Aucune donnée n'a été partiellement supprimée." },
      { status: 500 },
    );
  }
}
