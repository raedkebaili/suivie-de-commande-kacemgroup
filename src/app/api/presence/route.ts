import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { presenceCounts, recordPresence, validPresenceClient } from "@/lib/presence";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body || !validPresenceClient(body.clientId) || (body.offline !== undefined && typeof body.offline !== "boolean")) return NextResponse.json({ error: "Signal de présence invalide" }, { status: 400 });
  try { await recordPresence(user.id, body.clientId, body.offline === true); return NextResponse.json({ ok: true }); }
  catch (error) { console.error("[Presence] Échec heartbeat:", error); return NextResponse.json({ error: "Présence indisponible" }, { status: 503 }); }
}
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  try { return NextResponse.json(await presenceCounts(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { console.error("[Presence] Échec compteur:", error); return NextResponse.json({ error: "Compteur indisponible" }, { status: 503 }); }
}
