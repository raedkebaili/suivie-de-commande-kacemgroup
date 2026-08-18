export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productionUnitLib } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET() {
  const data = await db.select().from(productionUnitLib).orderBy(desc(productionUnitLib.usageCount)).limit(50);
  return NextResponse.json({ units: data });
}

export async function POST(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { name } = await request.json();
  if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  const ex = await db.select().from(productionUnitLib).where(eq(productionUnitLib.name, name.trim())).limit(1);
  if (ex.length > 0) {
    await db.update(productionUnitLib).set({ usageCount: ex[0].usageCount + 1 }).where(eq(productionUnitLib.id, ex[0].id));
    return NextResponse.json({ unit: ex[0] });
  }
  const [c] = await db.insert(productionUnitLib).values({ name: name.trim(), usageCount: 1 }).returning();
  return NextResponse.json({ unit: c }, { status: 201 });
}
