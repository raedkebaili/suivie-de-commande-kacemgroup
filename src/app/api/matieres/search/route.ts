export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matieres, materialCategories } from "@/db/schema";
import { eq, or, ilike, and, asc } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";

/**
 * API de recherche intelligente pour les matières
 * Supporte la recherche par référence, libellé, catégorie
 * Optimisée avec limite de résultats et recherche côté serveur
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const query = sp.get("q")?.trim() || "";
  const categoryId = sp.get("categoryId");
  const limit = Math.min(parseInt(sp.get("limit") || "20"), 50); // Max 50 résultats

  // Si pas de recherche, retourner les premières matières de la catégorie
  if (!query && categoryId) {
    const results = await db.select({
      id: matieres.id,
      categoryId: matieres.categoryId,
      category: matieres.category,
      reference: matieres.reference,
      name: matieres.name,
      stock: matieres.stock,
      specs: matieres.specs,
      categoryName: materialCategories.name,
      isTelegestion: materialCategories.isTelegestion,
    })
    .from(matieres)
    .leftJoin(materialCategories, eq(matieres.categoryId, materialCategories.id))
    .where(and(
      eq(matieres.categoryId, parseInt(categoryId)),
      eq(matieres.active, true)
    ))
    .orderBy(asc(matieres.reference))
    .limit(limit);

    return NextResponse.json({ results, query: "", total: results.length });
  }

  // Recherche avec terme
  if (query.length < 1) {
    return NextResponse.json({ results: [], query, total: 0 });
  }

  const searchPattern = `%${query}%`;
  
  // Construire les conditions de recherche
  const searchConditions = [
    ilike(matieres.reference, searchPattern),
    ilike(matieres.name, searchPattern),
    ilike(matieres.category, searchPattern),
    ilike(matieres.specs, searchPattern),
  ];

  // Ajouter filtre par catégorie si spécifié
  const whereConditions = categoryId
    ? and(
        eq(matieres.categoryId, parseInt(categoryId)),
        eq(matieres.active, true),
        or(...searchConditions)
      )
    : and(
        eq(matieres.active, true),
        or(...searchConditions)
      );

  const results = await db.select({
    id: matieres.id,
    categoryId: matieres.categoryId,
    category: matieres.category,
    reference: matieres.reference,
    name: matieres.name,
    stock: matieres.stock,
    specs: matieres.specs,
    categoryName: materialCategories.name,
    isTelegestion: materialCategories.isTelegestion,
  })
  .from(matieres)
  .leftJoin(materialCategories, eq(matieres.categoryId, materialCategories.id))
  .where(whereConditions)
  .orderBy(
    // Prioriser les correspondances exactes au début
    asc(matieres.reference),
    asc(matieres.name)
  )
  .limit(limit);

  return NextResponse.json({ 
    results, 
    query, 
    total: results.length,
    hasMore: results.length === limit 
  });
}
