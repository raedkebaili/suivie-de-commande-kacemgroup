export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients, clientRecouvrementStates, recouvrementStates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

/**
 * GET /api/recouvrement/client-states
 * Toutes les affectations courantes client ↔ état de recouvrement.
 * Lecture : tout utilisateur authentifié (affichage dans le tableau clients).
 */
export async function GET(request: NextRequest) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const rows = await db
      .select({
        clientId: clientRecouvrementStates.clientId,
        clientName: clients.name,
        stateId: clientRecouvrementStates.stateId,
        stateKey: recouvrementStates.key,
        label: recouvrementStates.label,
        colorKey: recouvrementStates.colorKey,
        note: clientRecouvrementStates.note,
        updatedByName: clientRecouvrementStates.updatedByName,
        updatedAt: clientRecouvrementStates.updatedAt,
      })
      .from(clientRecouvrementStates)
      .innerJoin(recouvrementStates, eq(clientRecouvrementStates.stateId, recouvrementStates.id))
      .innerJoin(clients, eq(clientRecouvrementStates.clientId, clients.id));

    return NextResponse.json({ assignments: rows });
  } catch (error) {
    console.error("Erreur lecture affectations recouvrement:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des états clients" }, { status: 500 });
  }
}
