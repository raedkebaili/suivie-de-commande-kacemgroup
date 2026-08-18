export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { expeditionBatches } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { itemId } = await params;
  const rows = await db.select().from(expeditionBatches)
    .where(eq(expeditionBatches.itemId, parseInt(itemId)))
    .orderBy(desc(expeditionBatches.createdAt));

  const batches = rows.map(r => ({
    id: r.id, itemId: r.itemId, orderId: r.orderId,
    quantity: r.quantity, cumulativeTotal: r.cumulativeTotal,
    driverName: r.driverName || null,
    plannedLoadingDate: r.plannedLoadingDate || null,
    deliveredBy: r.deliveredBy,
    deliveryDate: r.deliveryDate,
    note: r.note || null,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ batches });
}
