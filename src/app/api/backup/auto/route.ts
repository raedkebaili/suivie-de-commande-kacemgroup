import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { desc } from "drizzle-orm";
// Les tables sauvegardées sont désormais listées dans src/lib/backup-data.ts.
// Cette route n'a plus besoin que de backupHistory et systemSettings.
import { backupHistory, systemSettings } from "@/db/schema";
import { getUserFromHeaders } from "@/lib/auth";
import { runAutomaticBackup, backupTimezone } from "@/lib/automatic-backup";
import { backupDue, backupRetention } from "@/lib/backup-schedule";
import { and, eq } from "drizzle-orm";
import { matchesBackupSecret } from "@/lib/backup-cron-auth";
import { parseSessionIdleTimeoutMinutes, SESSION_IDLE_TIMEOUT_KEY } from "@/lib/session-timeout";

function isCronAuthorized(header: string | null): boolean {
  return matchesBackupSecret(header, process.env.BACKUP_SECRET);
}

export const dynamic = "force-dynamic";

export const maxDuration = 300;

/** Déclencheur admin ou ancien cron externe ; toutes les règles sont côté serveur. */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  const cron = isCronAuthorized(request.headers.get("x-backup-secret"));
  if (!user && !cron) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user && user.role !== "superadmin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    const force = !!user && body?.force === true;
    const result = await runAutomaticBackup({ force, actor: user || undefined, source: force ? "manual" : cron ? "cron" : "browser" });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "La sauvegarde a échoué. Consultez l’historique pour le diagnostic." }, { status: 500 });
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

    const [lastSuccessful] = await db.select({ createdAt: backupHistory.createdAt }).from(backupHistory)
      .where(and(eq(backupHistory.type, "automatic"), eq(backupHistory.status, "success")))
      .orderBy(desc(backupHistory.createdAt)).limit(1);

    // Compter les sauvegardes
    const allBackups = await db.select({
      id: backupHistory.id,
      type: backupHistory.type,
    }).from(backupHistory);
    const autoBackups = allBackups.filter(b => b.type === "automatic");

    return NextResponse.json({
      enabled: settingsMap.backup_enabled !== "false",
      timeZone: backupTimezone(),
      schedulerMode: process.env.VERCEL ? "vercel-cron" : "server",
      cronConfigured: !!process.env.CRON_SECRET,
      lastSchedulerCheck: settingsMap.backup_last_scheduler_check || null,
      lastTrigger: settingsMap.backup_last_trigger || null,
      lastCronCheck: settingsMap.backup_last_cron_check || null,
      lastSuccess: lastSuccessful?.createdAt || null,
      schedule: backupDue({ time: settingsMap.backup_time || "22:00", timeZone: backupTimezone(), lastSuccess: lastSuccessful?.createdAt, lastAttempt: settingsMap.backup_last_run, lastStatus: settingsMap.backup_last_status }),
      time: settingsMap.backup_time || "22:00",
      maxCount: backupRetention(settingsMap.backup_max_count),
      idleTimeoutMinutes: parseSessionIdleTimeoutMinutes(settingsMap[SESSION_IDLE_TIMEOUT_KEY]),
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
