import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/orders/[id]/items — articles STRICTEMENT limités à la commande
// (ÉVOLUTION ÉTUDES §3). Le serveur ne renvoie JAMAIS d'articles d'une autre
// commande : même un client manipulé ne peut pas les obtenir ici.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const orderId = parseInt((await params).id);
  if (!Number.isFinite(orderId)) return NextResponse.json({ error: "id commande invalide" }, { status: 400 });

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return NextResponse.json({ error: "Commande non trouvée" }, { status: 404 });

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.articleName));

  return NextResponse.json({
    order: { id: order.id, orderNumber: order.orderNumber, affaire: order.affaire },
    items: items.map((i) => ({
      id: i.id,
      orderId: i.orderId,
      reference: i.reference,
      articleName: i.articleName,
      quantity: i.quantity,
      lens: i.lens,
      lensBy: i.lensBy,
      lensAt: i.lensAt,
    })),
  });
}
