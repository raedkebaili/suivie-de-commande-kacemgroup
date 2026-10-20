export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, clients, agencies, articleFamilyAssignments, articleFamilyCatalog, itemTechnicalComponents } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getUserFromHeaders } from "@/lib/auth";
import { agencyScopeForUser } from "@/lib/agency-access";
import { groupArticles, type GroupableItem } from "@/lib/article-grouping";
import { catalogLabel } from "@/lib/article-family-catalog";
import { readGroupingConfig } from "@/lib/article-grouping-config";
import { filterMaterialSummary, parseMaterialSummaryFilters, filterRequirementLines, parseRequirementFilters, requirementSummary, sortRequirementLines, withLegacySpecs, type RequirementLine, type TechnicalSpec } from "@/lib/material-requirements";

/** Catalogue complet : les nouvelles désignations peuvent être reconnues sans affectation. */
async function loadFamilyRecognition() {
  const catalog = await db.select().from(articleFamilyCatalog);
  const assignments = await db.select().from(articleFamilyAssignments);
  const byId = new Map(catalog.map(entry => [entry.id, entry]));
  const manual = new Map<string, string>();
  for (const assignment of assignments) {
    const entry = byId.get(assignment.catalogId);
    if (entry) manual.set(assignment.designation, catalogLabel(entry));
  }
  return { catalog, manual };
}

/**
 * GET /api/orders/material-requirements
 * Synthèse indépendante des matières renseignées dans les articles autorisés.
 * Les filtres de matières sont appliqués après agrégation, sans modifier les regroupements classiques.
 *
 * Query : status, agencyId, priority (mêmes filtres que /api/orders)
 *         filtres des articles sources, recherche et tri des matières agrégées ;
 *         format=xlsx applique le même périmètre à toutes les feuilles Excel.
 * Lecture : tout utilisateur authentifié (vue d'affichage, aucune écriture).
 */

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  let filters, materialFilters;
  try {
    if (request.url.length > 20000) throw new Error("Filtres trop longs");
    filters = parseRequirementFilters(sp);
    materialFilters = parseMaterialSummaryFilters(sp);
    if (sp.get("agencyId") && (!/^[1-9]\d*$/.test(sp.get("agencyId")!) || !Number.isSafeInteger(Number(sp.get("agencyId"))) || Number(sp.get("agencyId")) > 2147483647)) throw new Error("Agence invalide");
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const conditions = [];
  const scope = agencyScopeForUser(user);
  if (scope) conditions.push(inArray(orders.agencyId, scope));
  if (sp.get("status")) conditions.push(eq(orders.status, sp.get("status")!));
  if (sp.get("agencyId")) conditions.push(eq(orders.agencyId, Number(sp.get("agencyId"))));
  if (sp.get("priority")) conditions.push(eq(orders.priority, sp.get("priority")!));
  try {
    const rows = await db.select({
      itemId: orderItems.id, articleName: orderItems.articleName, quantity: orderItems.quantity,
      affaire: orders.affaire, orderNumber: orders.orderNumber, orderDate: orders.orderDate,
      clientName: clients.name, agencyName: agencies.name,
      pcb: orderItems.pcb, colorTemperature: orderItems.colorTemperature, lens: orderItems.lens,
      driver: orderItems.driver, electricalClass: orderItems.electricalClass, accessories: orderItems.accessories, otherTechSpecs: orderItems.otherTechSpecs,
    }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(clients, eq(orders.clientId, clients.id)).leftJoin(agencies, eq(orders.agencyId, agencies.id))
      .where(conditions.length ? and(...conditions) : undefined).orderBy(desc(orders.createdAt));
    const { catalog, manual } = await loadFamilyRecognition();
    const config = await readGroupingConfig();
    // La synthèse couvre toutes les matières saisies, indépendamment des anciennes colonnes choisies.
    const selectedCategories = config.categories;
    const components: (typeof itemTechnicalComponents.$inferSelect)[] = [];
    // Requêtes groupées, sans N+1 et sans dépasser la limite de paramètres PostgreSQL.
    for (let offset = 0; offset < rows.length; offset += 5000) {
      components.push(...await db.select().from(itemTechnicalComponents)
        .where(inArray(itemTechnicalComponents.itemId, rows.slice(offset, offset + 5000).map(r => r.itemId))));
    }
    const byItem = new Map<number, TechnicalSpec[]>();
    const currentKeys = new Map(config.current.map(c => [c.id, c.key]));
    for (const component of components) {
      const list = byItem.get(component.itemId) || [];
      list.push({ categoryKey: (component.categoryId && currentKeys.get(component.categoryId)) || component.categoryKey,
        categoryName: component.categoryName, materialId: component.materialId,
        materialReference: component.materialReference, materialLabel: component.materialLabel }); byItem.set(component.itemId, list);
    }
    const allGroups = groupArticles(rows.map(row => ({ ...row, components: withLegacySpecs(byItem.get(row.itemId) || [], row, config.categories) })) as GroupableItem[], manual, catalog);
    const allLines: RequirementLine[] = allGroups.flatMap(g => g.lines.map(l => ({ ...l, groupKey: g.key, components: l.components || [] })));
    const validSorts = new Set(["articleName", "power", "familyCategory", "quantity", "affaire", "clientName", "orderNumber", "orderDate", ...selectedCategories.flatMap(c => [`spec:${c.key}`, `total:${c.key}`])]);
    if (filters.sorts?.some(s => !validSorts.has(s.field)) || filters.technical?.some(f => !selectedCategories.some(c => c.key === f.key))) return NextResponse.json({ error: "Catégorie de filtre ou champ de tri non visible ; actualisez les filtres" }, { status: 400 });
    const lines = sortRequirementLines(filterRequirementLines(allLines, filters, selectedCategories), filters.sorts);
    const sourceSummary = requirementSummary(lines, selectedCategories);
    const summary = filterMaterialSummary(sourceSummary, materialFilters);
    const totals = { groups: new Set(lines.map(line => line.groupKey)).size, lines: lines.length, quantity: lines.reduce((sum, l) => sum + l.quantity, 0) };
    if (sp.get("format") === "xlsx") {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary.flatMap(c => c.materials.map(m => ({ "Catégorie": c.name, "Référence": m.reference, "Matière": m.label, "Besoin (unités)": m.quantity, "Saisie ancienne": m.legacy ? "Oui, à vérifier" : "Non" }))), { header: ["Catégorie", "Référence", "Matière", "Besoin (unités)", "Saisie ancienne"] }), "Besoin par matière");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary.map(c => ({ "Catégorie": c.name, "Besoin connu (unités)": c.quantity, "Lignes non renseignées": c.missingLines })), { header: ["Catégorie", "Besoin connu (unités)", "Lignes non renseignées"] }), "Totaux catégories");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ["Règle", "1 unité de chaque matière sélectionnée par article commandé. Besoin brut, sans déduction du stock, de la production ou des livraisons."],
        ["Données manquantes", "Non renseigné ne signifie pas zéro. Les totaux connus sont partiels si des lignes restent non renseignées."],
        ["Anciennes saisies", "Les textes historiques non vides sont traités comme une sélection unique, non découpés. À vérifier par le responsable technique."],
        ["Périmètre", "Filtres des articles sources, puis filtres et tri des matières identiques à la synthèse affichée. Sans modification des regroupements classiques."],
      ]), "Règles de calcul");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="besoin-matiere-${new Date().toISOString().slice(0, 10)}.xlsx"` } });
    }
    const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    return NextResponse.json({ totals, summary, categories: config.categories, selectedKeys: selectedCategories.map(c => c.key), categoryOptions: sourceSummary.filter(c => c.materials.length).map(c => ({ key: c.key, name: c.name })), options: {
      articles: unique(allLines.map(l => l.articleName)), families: unique(allLines.map(l => l.familyCategory || "Non classée")),
      powers: unique(allLines.map(l => l.power === null ? "unknown" : String(l.power))), clients: unique(allLines.map(l => l.clientName || "Non renseigné")), orderNumbers: unique(allLines.map(l => l.orderNumber || "Non renseigné")),
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Regroupement] Besoin matière:", error);
    return NextResponse.json({ error: "Erreur lors du calcul du besoin matière" }, { status: 500 });
  }
}
