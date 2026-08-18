export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { techLibrary } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const cat = new URL(request.url).searchParams.get("category");
  const data = cat
    ? await db.select().from(techLibrary).where(eq(techLibrary.category, cat)).orderBy(desc(techLibrary.usageCount)).limit(100)
    : await db.select().from(techLibrary).orderBy(desc(techLibrary.usageCount)).limit(200);
  return NextResponse.json({ techs: data });
}

export async function POST(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u || !["superadmin", "technique"].includes(u.role))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { category, value } = await request.json();
  if (!category || !value) return NextResponse.json({ error: "Catégorie et valeur requis" }, { status: 400 });
  const ex = await db.select().from(techLibrary).where(eq(techLibrary.value, value.trim())).limit(1);
  if (ex.length > 0) {
    await db.update(techLibrary).set({ usageCount: ex[0].usageCount + 1 }).where(eq(techLibrary.id, ex[0].id));
    return NextResponse.json({ tech: ex[0] });
  }
  const [c] = await db.insert(techLibrary).values({ category, value: value.trim(), usageCount: 1 }).returning();
  return NextResponse.json({ tech: c }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u || !["superadmin", "technique"].includes(u.role))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id } = await request.json();
  await db.delete(techLibrary).where(eq(techLibrary.id, parseInt(id)));
  return NextResponse.json({ ok: true });
}
