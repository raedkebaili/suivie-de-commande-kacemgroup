export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agencies } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { logActivity, getUserFromHeaders } from "@/lib/auth";

async function auth(request: Request, roles?: string[]) {
  const user = await getUserFromHeaders(request);
  if (!user) return { ok: false as const, status: 401, error: "Non authentifié" };
  if (roles && !roles.includes(user.role)) return { ok: false as const, status: 403, error: "Accès refusé" };
  return { ok: true as const, user };
}

export async function GET(request: NextRequest) {
  const a = await auth(request); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  
  const data = await db.select().from(agencies).orderBy(desc(agencies.createdAt));
  return NextResponse.json({ agencies: data });
}

export async function POST(request: NextRequest) {
  const a = await auth(request, ["superadmin", "commercial"]); if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  
  const { name, code, address } = await request.json();
  if (!name || !code) return NextResponse.json({ error: "Nom et code requis" }, { status: 400 });
  const ex = await db.select().from(agencies).where(eq(agencies.code, code.toUpperCase())).limit(1);
  if (ex.length > 0) return NextResponse.json({ error: "Code agence existe déjà" }, { status: 400 });
  const [created] = await db.insert(agencies).values({ name, code: code.toUpperCase(), address: address || null }).returning();
  await logActivity(a.user.id, a.user.username, "CREATE_AGENCY", `Agence: ${name}`);
  return NextResponse.json({ agency: created }, { status: 201 });
}
