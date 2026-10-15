import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { orderItems, articleFamilyCatalog, articleFamilyAssignments } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { catalogLabel, type ArticleFamilyCatalogEntry } from "@/lib/article-family-catalog";
import { FAMILY_IMPORT_MAX_ROWS, parseFamilyImportRows } from "@/lib/article-family-import";

/**
 * POST /api/admin/article-families/import  (multipart : file, mode = "preview" | "apply")
 * Superadmin uniquement. "preview" ne modifie rien ; "apply" crée les familles absentes,
 * réutilise celles qui existent déjà (même libellé) et affecte les désignations indiquées.
 * Les désignations et les commandes ne sont jamais modifiées.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!file || typeof (file as File).arrayBuffer !== "function") {
    return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
  }
  if ((file as File).size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Fichier trop volumineux (5 Mo maximum)" }, { status: 400 });
  }
  const preview = formData.get("mode") !== "apply";

  let rows: Record<string, unknown>[];
  try {
    const workbook = XLSX.read(Buffer.from(await (file as File).arrayBuffer()), { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: "Feuille Excel vide" }, { status: 400 });
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Fichier Excel illisible" }, { status: 400 });
  }
  if (rows.length > FAMILY_IMPORT_MAX_ROWS) {
    return NextResponse.json({ error: `Le fichier dépasse ${FAMILY_IMPORT_MAX_ROWS} lignes` }, { status: 400 });
  }

  const parsed = parseFamilyImportRows(rows);
  if (parsed.errors.length > 0) {
    return NextResponse.json({ error: "Import refusé : corrigez le fichier", details: parsed.errors }, { status: 400 });
  }

  try {
    const existing = await db.select().from(articleFamilyCatalog);
    const existingByLabel = new Map(existing.map((e) => [catalogLabel(e).toLowerCase(), e]));
    const toCreate = parsed.lines.filter((l) => !existingByLabel.has(catalogLabel(l.entry).toLowerCase()));
    const reused = parsed.lines.length - toCreate.length;

    const designations = parsed.lines.map((l) => l.designation).filter((d): d is string => !!d);
    const known = designations.length
      ? new Set((await db.selectDistinct({ designation: orderItems.articleName }).from(orderItems)
          .where(inArray(orderItems.articleName, designations))).map((r) => r.designation))
      : new Set<string>();
    const unknownDesignations = designations.filter((d) => !known.has(d));
    const toAssign = parsed.lines.filter((l) => l.designation && known.has(l.designation));

    const summary = {
      mode: preview ? "preview" : "apply",
      familiesToCreate: toCreate.map((l) => catalogLabel(l.entry)),
      familiesReused: reused,
      assignmentsToApply: toAssign.length,
      unknownDesignations,
    };
    if (preview) return NextResponse.json({ summary });

    await db.transaction(async (tx) => {
      const labelToEntry = new Map<string, ArticleFamilyCatalogEntry & { id: number }>(
        existing.map((e) => [catalogLabel(e).toLowerCase(), e]),
      );
      for (const line of toCreate) {
        const [created] = await tx.insert(articleFamilyCatalog).values(line.entry).returning();
        labelToEntry.set(catalogLabel(created).toLowerCase(), created);
      }
      const now = new Date().toISOString();
      for (const line of toAssign) {
        const entry = labelToEntry.get(catalogLabel(line.entry).toLowerCase())!;
        await tx.insert(articleFamilyAssignments)
          .values({ designation: line.designation!, catalogId: entry.id, assignedByName: user.fullName, assignedAt: now })
          .onConflictDoUpdate({
            target: articleFamilyAssignments.designation,
            set: { catalogId: entry.id, assignedByName: user.fullName, assignedAt: now },
          });
      }
    });

    await logActivity(user.id, user.username, "ARTICLE_FAMILY_IMPORT", `Import familles : ${toCreate.length} créée(s), ${reused} réutilisée(s), ${toAssign.length} affectation(s)`);
    return NextResponse.json({ summary: { ...summary, mode: "apply" } });
  } catch {
    return NextResponse.json({ error: "Erreur lors de l'import des familles" }, { status: 500 });
  }
}
