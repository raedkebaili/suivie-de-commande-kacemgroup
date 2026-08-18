export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { matieres, materialCategories, techLibrary } from "@/db/schema";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { ensureDefaultMaterialCategories } from "@/lib/material-categories";

async function authorizedUser(request: NextRequest, write = false) {
  const user = await getUserFromHeaders(request);
  if (!user) return null;
  if (write && !["superadmin", "technique"].includes(user.role)) return null;
  return user;
}

async function syncLegacyLibrary(category: string, label: string) {
  const [existing] = await db.select().from(techLibrary).where(and(eq(techLibrary.category, category), eq(techLibrary.value, label))).limit(1);
  if (!existing) await db.insert(techLibrary).values({ category, value: label, usageCount: 0 });
}

export async function GET(request: NextRequest) {
  const user = await authorizedUser(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  await ensureDefaultMaterialCategories();
  const categoryId = new URL(request.url).searchParams.get("categoryId");
  const data = categoryId
    ? await db.select().from(matieres).where(and(eq(matieres.categoryId, parseInt(categoryId)), eq(matieres.active, true))).orderBy(asc(matieres.reference), asc(matieres.name))
    : await db.select().from(matieres).where(eq(matieres.active, true)).orderBy(asc(matieres.category), asc(matieres.reference));
  return NextResponse.json({ matieres: data });
}

export async function POST(request: NextRequest) {
  const user = await authorizedUser(request, true);
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { categoryId, reference, label, stock, specs } = await request.json();
  if (!categoryId || !String(reference || "").trim() || !String(label || "").trim()) {
    return NextResponse.json({ error: "Catégorie, référence et libellé requis" }, { status: 400 });
  }
  const [category] = await db.select().from(materialCategories).where(eq(materialCategories.id, parseInt(categoryId))).limit(1);
  if (!category) return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
  const normalizedReference = String(reference).trim().toUpperCase();
  const duplicates = await db.select().from(matieres).where(eq(matieres.categoryId, category.id));
  if (duplicates.some(item => item.reference.toLowerCase() === normalizedReference.toLowerCase())) {
    return NextResponse.json({ error: "Cette référence existe déjà dans la catégorie" }, { status: 400 });
  }
  const [created] = await db.insert(matieres).values({
    categoryId: category.id,
    category: category.key,
    reference: normalizedReference,
    name: String(label).trim(),
    stock: Number(stock) || 0,
    specs: String(specs || "").trim() || null,
  }).returning();
  await syncLegacyLibrary(category.key, created.name);
  await logActivity(user.id, user.username, "CREATE_MATIERE", `${category.name}: ${created.reference} - ${created.name}`);
  return NextResponse.json({ matiere: created }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const user = await authorizedUser(request, true);
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const formData = await request.formData();
  const file = formData.get("file") as File;
  const categoryId = parseInt(String(formData.get("categoryId") || ""));
  if (!file || !categoryId) return NextResponse.json({ error: "Fichier et catégorie requis" }, { status: 400 });
  const [category] = await db.select().from(materialCategories).where(eq(materialCategories.id, categoryId)).limit(1);
  if (!category) return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]]);
  const existing = await db.select().from(matieres).where(eq(matieres.categoryId, category.id));
  const references = new Set(existing.map(item => item.reference.toLowerCase()));
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const reference = String(row["Référence"] ?? row["Reference"] ?? row["reference"] ?? row["REF"] ?? "").trim().toUpperCase();
    const label = String(row["Libellé"] ?? row["Libelle"] ?? row["label"] ?? row["Nom"] ?? row["name"] ?? "").trim();
    const stockRaw = row["Stock"] ?? row["stock"] ?? 0;
    if (!reference || !label || references.has(reference.toLowerCase())) { skipped++; continue; }
    await db.insert(matieres).values({
      categoryId: category.id,
      category: category.key,
      reference,
      name: label,
      stock: Number(String(stockRaw).replace(",", ".")) || 0,
      specs: String(row["Spécifications"] ?? row["Specifications"] ?? row["specs"] ?? "").trim() || null,
    });
    await syncLegacyLibrary(category.key, label);
    references.add(reference.toLowerCase());
    imported++;
  }
  await logActivity(user.id, user.username, "IMPORT_MATIERES", `${category.name}: ${imported} importées, ${skipped} ignorées`);
  return NextResponse.json({ imported, skipped });
}

export async function PATCH(request: NextRequest) {
  const user = await authorizedUser(request, true);
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id, reference, label, stock, specs } = await request.json();
  if (!id) return NextResponse.json({ error: "Identifiant requis" }, { status: 400 });
  const [existing] = await db.select().from(matieres).where(eq(matieres.id, parseInt(id))).limit(1);
  if (!existing) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  const [updated] = await db.update(matieres).set({
    reference: reference === undefined ? existing.reference : String(reference).trim().toUpperCase(),
    name: label === undefined ? existing.name : String(label).trim(),
    stock: stock === undefined ? existing.stock : Number(stock) || 0,
    specs: specs === undefined ? existing.specs : String(specs).trim() || null,
    updatedAt: new Date().toISOString(),
  }).where(eq(matieres.id, existing.id)).returning();
  await logActivity(user.id, user.username, "UPDATE_MATIERE", `${updated.reference} - ${updated.name}; stock ${updated.stock}`);
  return NextResponse.json({ matiere: updated });
}

export async function DELETE(request: NextRequest) {
  const user = await authorizedUser(request, true);
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id } = await request.json();
  const [existing] = await db.select().from(matieres).where(eq(matieres.id, parseInt(id))).limit(1);
  if (!existing) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  await db.update(matieres).set({ active: false, updatedAt: new Date().toISOString() }).where(eq(matieres.id, existing.id));
  await logActivity(user.id, user.username, "ARCHIVE_MATIERE", `${existing.reference} - ${existing.name}`);
  return NextResponse.json({ ok: true });
}
