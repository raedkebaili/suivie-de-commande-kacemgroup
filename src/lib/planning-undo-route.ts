import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { PlanningKind, PlanningUndoError, undoPlanning } from "./planning-undo";

export function planningUndoRoute(kind: PlanningKind) {
  return async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getUserFromHeaders(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (!["superadmin", "planification"].includes(user.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const rawId = (await params).id;
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400 }); }
    if (body?.confirmed !== true || typeof body.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt) {
      return NextResponse.json({ error: "Confirmation et version de la ligne requises" }, { status: 400 });
    }
    try {
      return NextResponse.json(await undoPlanning(kind, Number(rawId), body.expectedUpdatedAt, user));
    } catch (error) {
      if (error instanceof PlanningUndoError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error("Retour arrière planning:", error);
      return NextResponse.json({ error: "La correction n'a pas été enregistrée. Réessayez après actualisation." }, { status: 500 });
    }
  };
}
