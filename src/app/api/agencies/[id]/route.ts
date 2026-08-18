export const dynamic = "force-dynamic";
import { db as dbFromImport } from "@/db";import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agencies } from "@/db/schema";
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
  const { name, code, address, active } = await request.json();
  const [updated] = await db.update(agencies).set({ name, code, address, active }).where(eq(agencies.id, parseInt(id))).returning();
  if (!updated) return NextResponse.json({ error: "Agence non trouvée" }, { status: 404 });
  await logActivity(a.user.id, a.user.username, "UPDATE_AGENCY", `Agence: ${name}`);
  return NextResponse.json({ agency: updated });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth(request, ["superadmin"]); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const db = dbFromImport; const { id } = await params;
  await db.delete(agencies).where(eq(agencies.id, parseInt(id)));
  await logActivity(a.user.id, a.user.username, "DELETE_AGENCY", `ID: ${id}`);
  return NextResponse.json({ success: true });
}
