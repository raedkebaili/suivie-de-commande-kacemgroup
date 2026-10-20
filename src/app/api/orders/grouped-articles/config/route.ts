import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { getUserFromHeaders } from "@/lib/auth";
import { GROUPING_CATEGORIES_SETTING, readGroupingConfig } from "@/lib/article-grouping-config";
export const dynamic = "force-dynamic";
/** Configuration commune à tous, modifiable uniquement par l'administrateur système. */
export async function PUT(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.selectedKeys) || body.selectedKeys.length > 200 || body.selectedKeys.some((k: unknown) => typeof k !== "string" || k.length > 150)) return NextResponse.json({ error: "Liste de catégories invalide" }, { status: 400 });
  try {
    const { categories } = await readGroupingConfig();
    if (body.selectedKeys.some((key: string) => !categories.some(c => c.key === key))) return NextResponse.json({ error: "Catégorie inconnue ; actualisez le tableau" }, { status: 400 });
    const selectedKeys = [...new Set<string>(body.selectedKeys)];
    const values = { value: JSON.stringify(selectedKeys), updatedAt: new Date().toISOString(), updatedById: user.id, updatedByName: user.fullName };
    await db.insert(systemSettings).values({ key: GROUPING_CATEGORIES_SETTING, ...values, description: "Catégories techniques visibles dans le regroupement / besoin matière" }).onConflictDoUpdate({ target: systemSettings.key, set: values });
    return NextResponse.json({ ok: true, selectedKeys });
  } catch (error) {
    console.error("[Regroupement] Configuration:", error);
    return NextResponse.json({ error: "Impossible d'enregistrer les catégories" }, { status: 500 });
  }
}
