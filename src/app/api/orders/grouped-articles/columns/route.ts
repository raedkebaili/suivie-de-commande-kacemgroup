import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { getUserFromHeaders } from "@/lib/auth";
import { canonicalGroupingColumns, GROUPING_COLUMNS_SETTING, validGroupingColumns } from "@/lib/article-grouping-columns";
import { readGroupingColumns } from "@/lib/article-grouping-columns-server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    return NextResponse.json({ visibleColumns: await readGroupingColumns(), canConfigure: user.role === "superadmin" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Regroupement] Lecture colonnes:", error);
    return NextResponse.json({ error: "Impossible de lire les règles d’affichage des colonnes" }, { status: 500 });
  }
}
export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!validGroupingColumns(body?.visibleColumns)) return NextResponse.json({ error: "Liste de colonnes invalide" }, { status: 400 });
  const visibleColumns = canonicalGroupingColumns(body.visibleColumns);
  try {
    const values = { value: JSON.stringify(visibleColumns), updatedAt: new Date().toISOString(), updatedById: user.id, updatedByName: user.fullName };
    await db.insert(systemSettings).values({ key: GROUPING_COLUMNS_SETTING, ...values, description: "Colonnes du regroupement classique, affichage commun à tous les utilisateurs" }).onConflictDoUpdate({ target: systemSettings.key, set: values });
    return NextResponse.json({ ok: true, visibleColumns }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Regroupement] Écriture colonnes:", error);
    return NextResponse.json({ error: "Impossible d’enregistrer les règles d’affichage" }, { status: 500 });
  }
}
