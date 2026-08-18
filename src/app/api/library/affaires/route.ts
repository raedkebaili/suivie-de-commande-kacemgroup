export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { and, desc, isNotNull, ne, ilike, sql } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") || "";

  const cnt = sql<number>`count(*)`;
  let rows: { affaire: string | null; cnt: number }[];
  if (q) {
    rows = await db.select({ affaire: orders.affaire, cnt })
      .from(orders)
      .where(and(isNotNull(orders.affaire), ne(orders.affaire, ""), ilike(orders.affaire, `%${q}%`)))
      .groupBy(orders.affaire)
      .orderBy(desc(cnt))
      .limit(10);
  } else {
    rows = await db.select({ affaire: orders.affaire, cnt })
      .from(orders)
      .where(and(isNotNull(orders.affaire), ne(orders.affaire, "")))
      .groupBy(orders.affaire)
      .orderBy(desc(cnt))
      .limit(20);
  }
  return NextResponse.json({ affaires: rows });
}
