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
  const body = await request.json();
  if (typeof body.read !== "boolean") {
    return NextResponse.json({ error: "Le champ read doit être booléen" }, { status: 400 });
  }

  // Chaque utilisateur ne peut modifier QUE ses propres notifications.
  const updated = await db.update(notifications)
    .set({ read: body.read, readAt: body.read ? new Date().toISOString() : null })
    .where(and(eq(notifications.id, parseInt(id)), eq(notifications.userId, user.id)))
    .returning({ id: notifications.id });
  if (updated.length === 0) {
    return NextResponse.json({ error: "Notification introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
