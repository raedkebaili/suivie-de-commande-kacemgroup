export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;
  const { read } = await request.json();
  // CORRECTIF SÉCURITÉ (R4-IDOR) : chaque utilisateur ne peut modifier QUE
  // ses propres notifications — la clause porte sur (id, userId).
  const updated = await db.update(notifications)
    .set({ read })
    .where(and(eq(notifications.id, parseInt(id)), eq(notifications.userId, user.id)))
    .returning({ id: notifications.id });
  if (updated.length === 0) {
    return NextResponse.json({ error: "Notification introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
