export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getNextOrderNumberPreview } from "@/lib/order-number";

/**
 * GET /api/orders/next-number
 * Retourne un aperçu du prochain numéro de commande
 * Format: N/AAAA (ex: 1/2026, 125/2026)
 * 
 * Note: Ce numéro est indicatif. Le numéro définitif est généré
 * au moment de la création de la commande pour garantir l'unicité.
 */
export async function GET() {
  try {
    const orderNumber = await getNextOrderNumberPreview();
    return NextResponse.json({ orderNumber });
  } catch (error) {
    console.error("Error getting next order number:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du numéro" },
      { status: 500 }
    );
  }
}
