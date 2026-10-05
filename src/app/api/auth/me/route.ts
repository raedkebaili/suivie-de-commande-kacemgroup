export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders, seedDefaultUser } from "@/lib/auth";
import { friendlyDbErrorMessage } from "@/lib/db-error";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await seedDefaultUser();
    const user = await getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    // Le drapeau change-obligatoire est lu EN BASE (jamais dans le jeton,
    // qui pourrait être périmé après un changement effectué).
    const [row] = await db.select({ mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, user.id)).limit(1);
    return NextResponse.json({ user: { ...user, mustChangePassword: row?.mustChangePassword ?? false } });
  } catch (error) {
    console.error("Auth /me error:", error);
    return NextResponse.json({ error: friendlyDbErrorMessage(error) }, { status: 500 });
  }
}
