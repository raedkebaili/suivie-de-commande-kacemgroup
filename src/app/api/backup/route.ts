import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  users, agencies, clients, orders, orderItems, productionBatches, expeditionBatches,
  productionUnitLib, articleLibrary, techLibrary, materialCategories, matieres, itemTechnicalComponents,
  activityLogs, modificationLogs, notifications, backupHistory, photometricStudies, photometricStudyItems,
  recouvrementStates, clientRecouvrementStates, clientRecouvrementLogs,
  systemSettings, appColors, orderCounters,
} from "@/db/schema";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

export const dynamic = "force-dynamic";

const BACKUP_VERSION = 1;

// ── Export: read every table, in FK-safe order (parents first) ──
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const data = {
      users: await db.select().from(users),
      agencies: await db.select().from(agencies),
      clients: await db.select().from(clients),
      orders: await db.select().from(orders),
      orderItems: await db.select().from(orderItems),
      productionBatches: await db.select().from(productionBatches),
      expeditionBatches: await db.select().from(expeditionBatches),
      productionUnitLib: await db.select().from(productionUnitLib),
      articleLibrary: await db.select().from(articleLibrary),
      techLibrary: await db.select().from(techLibrary),
      materialCategories: await db.select().from(materialCategories),
      matieres: await db.select().from(matieres),
      itemTechnicalComponents: await db.select().from(itemTechnicalComponents),
      activityLogs: await db.select().from(activityLogs),
      modificationLogs: await db.select().from(modificationLogs),
      notifications: await db.select().from(notifications),
      photometricStudies: await db.select().from(photometricStudies),
      photometricStudyItems: await db.select().from(photometricStudyItems),
      recouvrementStates: await db.select().from(recouvrementStates),
      clientRecouvrementStates: await db.select().from(clientRecouvrementStates),
      clientRecouvrementLogs: await db.select().from(clientRecouvrementLogs),
      // Tables de configuration : couleurs, paramètres d'affichage (colonnes,
      // états de production, ligne TOTAL) et compteurs de numérotation.
      systemSettings: await db.select().from(systemSettings),
      appColors: await db.select().from(appColors),
      orderCounters: await db.select().from(orderCounters),
    };

    const totalRecords = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);

    const backup = {
      meta: {
        app: "OrderTrack Pro",
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        createdBy: user.fullName,
        totalRecords,
        type: "manual",
        tables: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
      },
      data,
    };

    const filename = `ordertrack-backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
    const backupJson = JSON.stringify(backup, null, 2);
    const filesize = Buffer.byteLength(backupJson, "utf8");

    // Enregistrer dans l'historique AVEC le contenu JSON
    await db.insert(backupHistory).values({
      filename,
      filesize,
      totalRecords,
      type: "manual",
      status: "success",
      backupData: backupJson,
      createdById: user.id,
      createdByName: user.fullName,
    });

    await logActivity(user.id, user.username, "BACKUP_EXPORT", `Sauvegarde manuelle générée: ${totalRecords} enregistrements`);

    return new NextResponse(backupJson, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Backup export error:", err);
    return NextResponse.json({ error: "Erreur lors de la génération de la sauvegarde: " + String(err) }, { status: 500 });
  }
}

// ── Restore: wipe all tables then reload from a previously exported backup ──
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  let body: { meta?: { version?: number }; data?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Fichier de sauvegarde invalide (JSON attendu)" }, { status: 400 });
  }

  const data = body?.data;
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "Format de sauvegarde invalide: section 'data' manquante" }, { status: 400 });
  }

  const arr = <T,>(key: string): T[] => {
    const v = (data as Record<string, unknown>)[key];
    return Array.isArray(v) ? (v as T[]) : [];
  };

  const usersRows = arr<typeof users.$inferInsert>("users");
  const agenciesRows = arr<typeof agencies.$inferInsert>("agencies");
  const clientsRows = arr<typeof clients.$inferInsert>("clients");
  const ordersRows = arr<typeof orders.$inferInsert>("orders");
  const orderItemsRows = arr<typeof orderItems.$inferInsert>("orderItems");
  const productionBatchesRows = arr<typeof productionBatches.$inferInsert>("productionBatches");
  const expeditionBatchesRows = arr<typeof expeditionBatches.$inferInsert>("expeditionBatches");
  const productionUnitLibRows = arr<typeof productionUnitLib.$inferInsert>("productionUnitLib");
  const articleLibraryRows = arr<typeof articleLibrary.$inferInsert>("articleLibrary");
  const techLibraryRows = arr<typeof techLibrary.$inferInsert>("techLibrary");
  const materialCategoriesRows = arr<typeof materialCategories.$inferInsert>("materialCategories");
  const matieresRows = arr<typeof matieres.$inferInsert>("matieres");
  const itemTechnicalComponentsRows = arr<typeof itemTechnicalComponents.$inferInsert>("itemTechnicalComponents");
  const activityLogsRows = arr<typeof activityLogs.$inferInsert>("activityLogs");
  const modificationLogsRows = arr<typeof modificationLogs.$inferInsert>("modificationLogs");
  const notificationsRows = arr<typeof notifications.$inferInsert>("notifications");
  const photometricStudiesRows = arr<typeof photometricStudies.$inferInsert>("photometricStudies");
  const photometricStudyItemsRows = arr<typeof photometricStudyItems.$inferInsert>("photometricStudyItems");
  const recouvrementStatesRows = arr<typeof recouvrementStates.$inferInsert>("recouvrementStates");
  const clientRecouvrementStatesRows = arr<typeof clientRecouvrementStates.$inferInsert>("clientRecouvrementStates");
  const clientRecouvrementLogsRows = arr<typeof clientRecouvrementLogs.$inferInsert>("clientRecouvrementLogs");
  // Tables de configuration — RÉTROCOMPATIBILITÉ : les sauvegardes générées
  // avant l'ajout de ces tables ne les contiennent pas. Dans ce cas on NE
  // touche pas à la configuration en place (pas de purge), afin de ne jamais
  // perdre les couleurs / réglages d'affichage lors d'une restauration ancienne.
  const systemSettingsRows = arr<typeof systemSettings.$inferInsert>("systemSettings");
  const appColorsRows = arr<typeof appColors.$inferInsert>("appColors");
  const orderCountersRows = arr<typeof orderCounters.$inferInsert>("orderCounters");
  const restoreSettings = systemSettingsRows.length > 0;
  const restoreColors = appColorsRows.length > 0;
  const restoreCounters = orderCountersRows.length > 0;

  const insertChunked = async <T extends Record<string, unknown>>(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    table: Parameters<typeof tx.insert>[0],
    rows: T[],
  ) => {
    if (rows.length === 0) return;
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.insert(table).values(rows.slice(i, i + chunkSize) as any);
    }
  };

  try {
    await db.transaction(async (tx) => {
      // Delete in reverse FK-dependency order
      await tx.delete(clientRecouvrementLogs);
      await tx.delete(clientRecouvrementStates);
      await tx.delete(notifications);
      await tx.delete(modificationLogs);
      await tx.delete(activityLogs);
      await tx.delete(photometricStudyItems);
      await tx.delete(photometricStudies);
      await tx.delete(expeditionBatches);
      await tx.delete(productionBatches);
      await tx.delete(itemTechnicalComponents);
      await tx.delete(orderItems);
      await tx.delete(orders);
      await tx.delete(matieres);
      await tx.delete(materialCategories);
      await tx.delete(techLibrary);
      await tx.delete(articleLibrary);
      await tx.delete(productionUnitLib);
      await tx.delete(clients);
      await tx.delete(recouvrementStates);
      await tx.delete(agencies);
      if (restoreSettings) await tx.delete(systemSettings);
      if (restoreColors) await tx.delete(appColors);
      if (restoreCounters) await tx.delete(orderCounters);
      await tx.delete(users);

      // Insert in forward FK-dependency order (parents first)
      await insertChunked(tx, users, usersRows);
      await insertChunked(tx, agencies, agenciesRows);
      await insertChunked(tx, clients, clientsRows);
      await insertChunked(tx, recouvrementStates, recouvrementStatesRows);
      await insertChunked(tx, clientRecouvrementStates, clientRecouvrementStatesRows);
      await insertChunked(tx, clientRecouvrementLogs, clientRecouvrementLogsRows);
      await insertChunked(tx, orders, ordersRows);
      await insertChunked(tx, orderItems, orderItemsRows);
      await insertChunked(tx, materialCategories, materialCategoriesRows);
      await insertChunked(tx, matieres, matieresRows);
      await insertChunked(tx, itemTechnicalComponents, itemTechnicalComponentsRows);
      await insertChunked(tx, productionBatches, productionBatchesRows);
      await insertChunked(tx, expeditionBatches, expeditionBatchesRows);
      await insertChunked(tx, productionUnitLib, productionUnitLibRows);
      await insertChunked(tx, articleLibrary, articleLibraryRows);
      await insertChunked(tx, techLibrary, techLibraryRows);
      await insertChunked(tx, activityLogs, activityLogsRows);
      await insertChunked(tx, modificationLogs, modificationLogsRows);
      await insertChunked(tx, notifications, notificationsRows);
      await insertChunked(tx, photometricStudies, photometricStudiesRows);
      await insertChunked(tx, photometricStudyItems, photometricStudyItemsRows);
      if (restoreSettings) await insertChunked(tx, systemSettings, systemSettingsRows);
      if (restoreColors) await insertChunked(tx, appColors, appColorsRows);
      if (restoreCounters) await insertChunked(tx, orderCounters, orderCountersRows);

      // Resync auto-increment sequences with the restored max ids
      const tableNames = [
        "users", "agencies", "clients", "orders", "order_items", "production_batches",
        "expedition_batches", "production_unit_lib", "article_library", "tech_library",
        "material_categories", "matieres", "item_technical_components", "activity_logs", "modification_logs", "notifications",
        "photometric_studies", "photometric_study_items",
        "recouvrement_states", "client_recouvrement_states", "client_recouvrement_logs",
        ...(restoreSettings ? ["system_settings"] : []),
        ...(restoreColors ? ["app_colors"] : []),
        ...(restoreCounters ? ["order_counters"] : []),
      ];
      for (const t of tableNames) {
        await tx.execute(
          sql.raw(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), true)`)
        );
      }
    });
  } catch (err) {
    console.error("Backup restore error:", err);
    return NextResponse.json({ error: "Erreur lors de la restauration: " + String(err) }, { status: 500 });
  }

  const totalRestored = usersRows.length + agenciesRows.length + clientsRows.length + ordersRows.length +
    orderItemsRows.length + productionBatchesRows.length + expeditionBatchesRows.length +
    productionUnitLibRows.length + articleLibraryRows.length + techLibraryRows.length +
    materialCategoriesRows.length + matieresRows.length + itemTechnicalComponentsRows.length +
    activityLogsRows.length + modificationLogsRows.length + notificationsRows.length +
    photometricStudiesRows.length + photometricStudyItemsRows.length +
    recouvrementStatesRows.length + clientRecouvrementStatesRows.length + clientRecouvrementLogsRows.length +
    systemSettingsRows.length + appColorsRows.length + orderCountersRows.length;

  await logActivity(user.id, user.username, "BACKUP_RESTORE", `Restauration effectuée: ${totalRestored} enregistrements`);

  return NextResponse.json({ ok: true, restored: totalRestored });
}
