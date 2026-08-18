export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { articleLibrary } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") || "";
  let data;
  if (q) {
    data = await db.select().from(articleLibrary).where(eq(articleLibrary.name, q)).limit(20);
    // Also search by LIKE
    if (data.length === 0) {
      const { sql } = await import("drizzle-orm");
      data = await db.select().from(articleLibrary).where(sql`name LIKE ${"%" + q + "%"}`).limit(20);
    }
  } else {
    data = await db.select().from(articleLibrary).orderBy(desc(articleLibrary.usageCount)).limit(50);
  }
  return NextResponse.json({ articles: data });
}

export async function POST(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { name, description } = await request.json();
  if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  const ex = await db.select().from(articleLibrary).where(eq(articleLibrary.name, name.trim())).limit(1);
  if (ex.length > 0) {
    await db.update(articleLibrary).set({ usageCount: ex[0].usageCount + 1 }).where(eq(articleLibrary.id, ex[0].id));
    return NextResponse.json({ article: ex[0] });
  }
  const [created] = await db.insert(articleLibrary).values({ name: name.trim(), description: description || null, usageCount: 1 }).returning();
  return NextResponse.json({ article: created }, { status: 201 });
}
