export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients, clientRecouvrementLogs, clientRecouvrementStates, recouvrementStates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { RECOUVREMENT_MANAGER_ROLES } from "@/lib/recouvrement-constants";

/**
 * PUT /api/recouvrement/client-states/[clientId]
 * Affecte (ou retire) l'état de recouvrement d'un client.
 * Rôles : superadmin, recouvrement.
 * Body: { stateId: number | null, note?: string }  — stateId null = retirer l'état.
 * Chaque changement est tracé dans client_recouvrement_logs + activity_logs.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const u = await getUserFromHeaders(request);
  if (!u) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!RECOUVREMENT_MANAGER_ROLES.includes(u.role as (typeof RECOUVREMENT_MANAGER_ROLES)[number])) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { clientId } = await params;
  const cid = parseInt(clientId);
  if (!Number.isFinite(cid)) return NextResponse.json({ error: "Identifiant client invalide" }, { status: 400 });

  try {
    const [client] = await db.select().from(clients).where(eq(clients.id, cid)).limit(1);
    if (!client) return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });

    const body = await request.json();
    const note = String(body.note || "").trim() || null;
    const now = new Date().toISOString();
    const stateId: number | null = body.stateId === null || body.stateId === undefined || body.stateId === ""
      ? null
      : parseInt(body.stateId);

    // ── Retrait de l'état ──
    if (stateId === null) {
      const [existing] = await db.select().from(clientRecouvrementStates).where(eq(clientRecouvrementStates.clientId, cid)).limit(1);
      if (!existing) return NextResponse.json({ assignment: null });
      await db.delete(clientRecouvrementStates).where(eq(clientRecouvrementStates.clientId, cid));
      await db.insert(clientRecouvrementLogs).values({
        clientId: cid, stateId: null, stateLabel: "(état retiré)", note,
        userId: u.id, username: u.fullName,
      });
      await logActivity(u.id, u.username, "CLEAR_RECOUVREMENT_STATE", `Client: ${client.name}`);
      return NextResponse.json({ assignment: null });
    }

    if (!Number.isFinite(stateId)) return NextResponse.json({ error: "État invalide" }, { status: 400 });

    // L'état doit exister et être actif
    const [state] = await db.select().from(recouvrementStates).where(eq(recouvrementStates.id, stateId)).limit(1);
    if (!state) return NextResponse.json({ error: "État de recouvrement non trouvé" }, { status: 404 });
    if (!state.active) return NextResponse.json({ error: "Cet état est désactivé" }, { status: 400 });

    // Upsert : 1 état courant par client (client_id unique)
    const [existing] = await db.select().from(clientRecouvrementStates).where(eq(clientRecouvrementStates.clientId, cid)).limit(1);
    let assignment;
    if (existing) {
      [assignment] = await db.update(clientRecouvrementStates)
        .set({ stateId: state.id, note, updatedById: u.id, updatedByName: u.fullName, updatedAt: now })
        .where(eq(clientRecouvrementStates.clientId, cid))
        .returning();
    } else {
      [assignment] = await db.insert(clientRecouvrementStates)
        .values({ clientId: cid, stateId: state.id, note, updatedById: u.id, updatedByName: u.fullName })
        .returning();
    }

    await db.insert(clientRecouvrementLogs).values({
      clientId: cid, stateId: state.id, stateLabel: state.label, note,
      userId: u.id, username: u.fullName,
    });
    await logActivity(u.id, u.username, "SET_RECOUVREMENT_STATE", `Client: ${client.name} → ${state.label}`);

    return NextResponse.json({
      assignment: {
        clientId: cid,
        clientName: client.name,
        stateId: state.id,
        stateKey: state.key,
        label: state.label,
        colorKey: state.colorKey,
        note: assignment.note,
        updatedByName: assignment.updatedByName,
        updatedAt: assignment.updatedAt,
      },
    });
  } catch (error) {
    console.error("Erreur affectation état recouvrement:", error);
    return NextResponse.json({ error: "Erreur lors de l'affectation de l'état" }, { status: 500 });
  }
}
