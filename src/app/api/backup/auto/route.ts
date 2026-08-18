import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { desc } from "drizzle-orm";
import {
  users, agencies, clients, orders, orderItems, productionBatches, expeditionBatches,
  productionUnitLib, articleLibrary, techLibrary, materialCategories, matieres, itemTechnicalComponents,
  activityLogs, modificationLogs, notifications, backupHistory, systemSettings, photometricStudies, photometricStudyItems,
} from "@/db/schema";
import { getUserFromHeaders, logActivity } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const BACKUP_VERSION = 1;

/**
 * Génère les données de sauvegarde (même logique que GET /api/backup)
 */
async function generateBackupData() {
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
  };

  const totalRecords = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);

  return { data, totalRecords };
}

/**
 * Met à jour les paramètres de la dernière sauvegarde
 */
async function updateLastBackupStatus(status: string, errorMessage?: string) {
  const now = new Date().toISOString();

  const statusValue = errorMessage ? `error: ${errorMessage}` : status;

  for (const [key, value] of [["backup_last_run", now], ["backup_last_status", statusValue]] as const) {
    const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    if (existing) {
      await db.update(systemSettings).set({ value, updatedAt: now }).where(eq(systemSettings.key, key));
    } else {
      await db.insert(systemSettings).values({ key, value, description: key === "backup_last_run" ? "Date/heure de la dernière sauvegarde automatique" : "Statut de la dernière sauvegarde automatique" });
    }
  }
}

/**
 * Supprime les anciennes sauvegardes si la limite est atteinte.
 * Supprime aussi les données JSON associées pour libérer l'espace.
 */
async function cleanupOldBackups(maxCount: number) {
  const allBackups = await db.select({ id: backupHistory.id })
    .from(backupHistory)
    .where(eq(backupHistory.type, "automatic"))
    .orderBy(desc(backupHistory.createdAt));

  if (allBackups.length >= maxCount) {
    const toDelete = allBackups.slice(maxCount - 1); // -1 car on va en ajouter une nouvelle
    for (const backup of toDelete) {
      await db.delete(backupHistory).where(eq(backupHistory.id, backup.id));
    }
    return toDelete.length;
  }
  return 0;
}

/**
 * POST /api/backup/auto
 * Déclenche une sauvegarde automatique.
 * Le fichier JSON est stocké en base (colonne backup_data) pour
 * pouvoir être téléchargé à tout moment depuis l'historique.
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);

  // Permettre l'appel sans authentification pour les cron jobs (avec secret)
  const authHeader = request.headers.get("x-backup-secret");
  const isValidCron = authHeader === process.env.BACKUP_SECRET;

  if (!user && !isValidCron) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  if (user && user.role !== "superadmin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const forceRun = body.force === true;

  try {
    // Vérifier si la sauvegarde automatique est activée
    if (!forceRun) {
      const [enabledSetting] = await db.select().from(systemSettings).where(eq(systemSettings.key, "backup_enabled")).limit(1);
      if (enabledSetting?.value !== "true") {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: "Sauvegarde automatique désactivée",
        });
      }
    }

    // Récupérer le nombre max de sauvegardes à conserver
    const [maxCountSetting] = await db.select().from(systemSettings).where(eq(systemSettings.key, "backup_max_count")).limit(1);
    const maxCount = parseInt(maxCountSetting?.value || "30");

    // Supprimer les anciennes sauvegardes au-delà de la limite
    const deletedCount = await cleanupOldBackups(maxCount);

    // Générer les données de sauvegarde (même format que la sauvegarde manuelle)
    const { data, totalRecords } = await generateBackupData();

    const now = new Date();
    const datePart = now.toISOString().slice(0, 10);            // 2026-07-25
    const timePart = now.toISOString().slice(11, 16).replace(":", "-"); // 22-00
    const filename = `Backup_${datePart}_${timePart}.json`;

    const backup = {
      meta: {
        app: "OrderTrack Pro",
        version: BACKUP_VERSION,
        createdAt: now.toISOString(),
        createdBy: user?.fullName || "Système (automatique)",
        totalRecords,
        type: "automatic",
        tables: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
      },
      data,
    };

    // Sérialiser en JSON — c'est ce fichier que l'utilisateur pourra télécharger
    const backupJson = JSON.stringify(backup, null, 2);
    const filesize = Buffer.byteLength(backupJson, "utf8");

    // Stocker dans l'historique AVEC le contenu JSON complet
    await db.insert(backupHistory).values({
      filename,
      filesize,
      totalRecords,
      type: "automatic",
      status: "success",
      backupData: backupJson,
      createdById: user?.id || null,
      createdByName: user?.fullName || "Système",
    });

    // Mettre à jour le statut de dernière exécution
    await updateLastBackupStatus("success");

    // Logger l'activité
    if (user) {
      await logActivity(user.id, user.username, "AUTO_BACKUP", `Sauvegarde automatique: ${totalRecords} enregistrements, ${filename}`);
    }

    return NextResponse.json({
      ok: true,
      filename,
      totalRecords,
      filesize,
      deletedOldBackups: deletedCount,
    });
  } catch (error) {
    console.error("Erreur sauvegarde automatique:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Enregistrer l'échec dans l'historique (sans données)
    try {
      await db.insert(backupHistory).values({
        filename: `Backup_FAILED_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.json`,
        totalRecords: 0,
        type: "automatic",
        status: "error",
        errorMessage,
        createdById: user?.id || null,
        createdByName: user?.fullName || "Système",
      });
      await updateLastBackupStatus("error", errorMessage);
    } catch { /* best-effort */ }

    return NextResponse.json({
      ok: false,
      error: "Erreur lors de la sauvegarde automatique: " + errorMessage,
    }, { status: 500 });
  }
}

/**
 * GET /api/backup/auto
 * Retourne le statut de la sauvegarde automatique et les compteurs
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    // Récupérer les paramètres
    const settings = await db.select().from(systemSettings);
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    // Dernière sauvegarde automatique (sans le contenu data pour économiser la bande passante)
    const [lastAuto] = await db.select({
      id: backupHistory.id,
      filename: backupHistory.filename,
      filesize: backupHistory.filesize,
      totalRecords: backupHistory.totalRecords,
      type: backupHistory.type,
      status: backupHistory.status,
      errorMessage: backupHistory.errorMessage,
      createdAt: backupHistory.createdAt,
      createdByName: backupHistory.createdByName,
    })
      .from(backupHistory)
      .where(eq(backupHistory.type, "automatic"))
      .orderBy(desc(backupHistory.createdAt))
      .limit(1);

    // Compter les sauvegardes
    const allBackups = await db.select({
      id: backupHistory.id,
      type: backupHistory.type,
    }).from(backupHistory);
    const autoBackups = allBackups.filter(b => b.type === "automatic");

    return NextResponse.json({
      enabled: settingsMap.backup_enabled === "true",
      time: settingsMap.backup_time || "22:00",
      maxCount: parseInt(settingsMap.backup_max_count || "30"),
      lastRun: settingsMap.backup_last_run || null,
      lastStatus: settingsMap.backup_last_status || null,
      lastBackup: lastAuto || null,
      totalAutoBackups: autoBackups.length,
      totalBackups: allBackups.length,
    });
  } catch (error) {
    console.error("Erreur récupération statut:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
