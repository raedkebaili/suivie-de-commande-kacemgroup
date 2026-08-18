export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { materialCategories } from "@/db/schema";
import { categoryKeyFromName, ensureDefaultMaterialCategories } from "@/lib/material-categories";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  await ensureDefaultMaterialCategories();
  const categories = await db.select().from(materialCategories).orderBy(asc(materialCategories.sortOrder), asc(materialCategories.name));
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "technique"].includes(user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const { name } = await request.json();
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return NextResponse.json({ error: "Nom de catégorie requis" }, { status: 400 });

  await ensureDefaultMaterialCategories();
  const existing = await db.select().from(materialCategories);
  if (existing.some(category => category.name.toLowerCase() === normalizedName.toLowerCase())) {
    return NextResponse.json({ error: "Cette catégorie existe déjà" }, { status: 400 });
  }

  let key = categoryKeyFromName(normalizedName);
  let suffix = 2;
  while ((await db.select().from(materialCategories).where(eq(materialCategories.key, key)).limit(1)).length) {
    key = `${categoryKeyFromName(normalizedName)}-${suffix++}`;
  }
  const maxOrder = existing.reduce((max, category) => Math.max(max, category.sortOrder), 0);
  const [category] = await db.insert(materialCategories).values({
    key,
    name: normalizedName,
    sortOrder: maxOrder + 10,
    isTelegestion: false,
    active: true,
  }).returning();
  await logActivity(user.id, user.username, "CREATE_MATERIAL_CATEGORY", `Catégorie: ${normalizedName}`);
  return NextResponse.json({ category }, { status: 201 });
}
