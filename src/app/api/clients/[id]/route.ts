export const dynamic = "force-dynamic";
import { db as dbFromImport } from "@/db";import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity, getUserFromHeaders } from "@/lib/auth";

async function auth(request: Request, roles?: string[]) {
  const u = await getUserFromHeaders(request);
  if (!u) return { ok: false as const, status: 401, error: "Non authentifié" };
  if (roles && !roles.includes(u.role)) return { ok: false as const, status: 403, error: "Accès refusé" };
  return { ok: true as const, user: u };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth(request, ["superadmin", "commercial"]); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const db = dbFromImport; const { id } = await params;
  const { name, code, contactName, phone, email, address, active } = await request.json();
  const [updated] = await db.update(clients).set({ name, code, contactName, phone, email, address, active }).where(eq(clients.id, parseInt(id))).returning();
  if (!updated) return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
  await logActivity(a.user.id, a.user.username, "UPDATE_CLIENT", `Client: ${name}`);
  return NextResponse.json({ client: updated });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth(request, ["superadmin"]); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const db = dbFromImport; const { id } = await params;
  await db.delete(clients).where(eq(clients.id, parseInt(id)));
  await logActivity(a.user.id, a.user.username, "DELETE_CLIENT", `ID: ${id}`);
  return NextResponse.json({ success: true });
}
