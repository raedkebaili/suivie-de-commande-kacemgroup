export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { logActivity, getUserFromHeaders } from "@/lib/auth";

async function auth(request: Request, roles?: string[]) {
  const u = await getUserFromHeaders(request);
  if (!u) return { ok: false as const, status: 401, error: "Non authentifié" };
  if (roles && !roles.includes(u.role)) return { ok: false as const, status: 403, error: "Accès refusé" };
  return { ok: true as const, user: u };
}

export async function GET(request: NextRequest) {
  const a = await auth(request); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const data = await db.select().from(clients).orderBy(desc(clients.createdAt));
  return NextResponse.json({ clients: data });
}

export async function POST(request: NextRequest) {
  const a = await auth(request, ["superadmin", "commercial"]); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { name, code, contactName, phone, email, address } = await request.json();
  if (!name || !code) return NextResponse.json({ error: "Nom et code requis" }, { status: 400 });
  const ex = await db.select().from(clients).where(eq(clients.code, code.toUpperCase())).limit(1);
  if (ex.length > 0) return NextResponse.json({ error: "Code client existe déjà" }, { status: 400 });
  const [created] = await db.insert(clients).values({ name, code: code.toUpperCase(), contactName: contactName || null, phone: phone || null, email: email || null, address: address || null }).returning();
  await logActivity(a.user.id, a.user.username, "CREATE_CLIENT", `Client: ${name}`);
  return NextResponse.json({ client: created }, { status: 201 });
}

// DELETE all clients - superadmin only
export async function DELETE(request: NextRequest) {
  const a = await auth(request, ["superadmin"]); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const countRows = await db.select({ c: count() }).from(clients);
  const total = countRows[0]?.c || 0;
  await db.delete(clients);
  await logActivity(a.user.id, a.user.username, "DELETE_ALL_CLIENTS", `${total} supprimés`);
  return NextResponse.json({ deleted: total });
}
