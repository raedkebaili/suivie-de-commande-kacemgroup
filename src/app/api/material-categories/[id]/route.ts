export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "@/db";
import { materialCategories, matieres, itemTechnicalComponents } from "@/db/schema";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

// GET - Récupérer une catégorie spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const categoryId = parseInt(id);

  const [category] = await db.select().from(materialCategories).where(eq(materialCategories.id, categoryId)).limit(1);
  if (!category) {
    return NextResponse.json({ error: "Catégorie non trouvée" }, { status: 404 });
  }

  // Compter les matières dans cette catégorie
  const [matieresCount] = await db.select({ count: count() }).from(matieres)
    .where(eq(matieres.categoryId, categoryId));

  // Compter les utilisations dans les commandes
  const [usageCount] = await db.select({ count: count() }).from(itemTechnicalComponents)
    .where(eq(itemTechnicalComponents.categoryId, categoryId));

  return NextResponse.json({
    category,
    matieresCount: matieresCount?.count || 0,
    usageCount: usageCount?.count || 0,
  });
}

// DELETE - Supprimer une catégorie (avec vérifications)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "technique"].includes(user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;
  const categoryId = parseInt(id);

  // Vérifier que la catégorie existe
  const [category] = await db.select().from(materialCategories).where(eq(materialCategories.id, categoryId)).limit(1);
  if (!category) {
    return NextResponse.json({ error: "Catégorie non trouvée" }, { status: 404 });
  }

  // Vérifier si des matières actives sont associées
  const [activeMatieresCount] = await db.select({ count: count() }).from(matieres)
    .where(eq(matieres.categoryId, categoryId));

  if ((activeMatieresCount?.count || 0) > 0) {
    return NextResponse.json({
      error: "La catégorie contient des matières. Veuillez supprimer ou réaffecter les matières avant de supprimer la catégorie.",
      matieresCount: activeMatieresCount?.count || 0,
    }, { status: 400 });
  }

  // Vérifier si la catégorie est utilisée dans des commandes
  const [usageCount] = await db.select({ count: count() }).from(itemTechnicalComponents)
    .where(eq(itemTechnicalComponents.categoryId, categoryId));

  if ((usageCount?.count || 0) > 0) {
    // Suppression logique si utilisée dans l'historique
    await db.update(materialCategories)
      .set({ active: false })
      .where(eq(materialCategories.id, categoryId));

    await logActivity(
      user.id,
      user.username,
      "ARCHIVE_MATERIAL_CATEGORY",
      `Catégorie archivée (utilisée dans ${usageCount?.count} commande(s)): ${category.name} [ID: ${category.id}]`
    );

    return NextResponse.json({
      success: true,
      message: "La catégorie a été désactivée car elle est utilisée dans des commandes existantes. Les données historiques sont conservées.",
      archived: true,
      usageCount: usageCount?.count || 0,
    });
  }

  // Suppression physique si non utilisée
  await db.delete(materialCategories).where(eq(materialCategories.id, categoryId));

  await logActivity(
    user.id,
    user.username,
    "DELETE_MATERIAL_CATEGORY",
    `Catégorie supprimée définitivement: ${category.name} [ID: ${category.id}]`
  );

  return NextResponse.json({
    success: true,
    message: "Catégorie supprimée définitivement.",
    deleted: true,
  });
}

// PATCH - Modifier une catégorie
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromHeaders(request);
  if (!user || !["superadmin", "technique"].includes(user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;
  const categoryId = parseInt(id);
  const body = await request.json();

  const [category] = await db.select().from(materialCategories).where(eq(materialCategories.id, categoryId)).limit(1);
  if (!category) {
    return NextResponse.json({ error: "Catégorie non trouvée" }, { status: 404 });
  }

  const updates: Partial<typeof materialCategories.$inferInsert> = {};
  
  if (body.name !== undefined) {
    const newName = String(body.name).trim();
    if (!newName) {
      return NextResponse.json({ error: "Le nom ne peut pas être vide" }, { status: 400 });
    }
    // Vérifier l'unicité du nom
    const [existing] = await db.select().from(materialCategories)
      .where(eq(materialCategories.name, newName)).limit(1);
    if (existing && existing.id !== categoryId) {
      return NextResponse.json({ error: "Ce nom de catégorie existe déjà" }, { status: 400 });
    }
    updates.name = newName;
  }

  if (body.active !== undefined) {
    updates.active = Boolean(body.active);
  }

  if (body.sortOrder !== undefined) {
    updates.sortOrder = parseInt(body.sortOrder) || 0;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucune modification fournie" }, { status: 400 });
  }

  const [updated] = await db.update(materialCategories)
    .set(updates)
    .where(eq(materialCategories.id, categoryId))
    .returning();

  await logActivity(
    user.id,
    user.username,
    "UPDATE_MATERIAL_CATEGORY",
    `Catégorie modifiée: ${category.name} → ${JSON.stringify(updates)}`
  );

  return NextResponse.json({ category: updated });
}
