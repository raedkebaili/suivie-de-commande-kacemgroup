import { db } from "@/db";
import { backupHistory, systemSettings } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { collectBackupData } from "./backup-data";
import { backupDue, backupRetention, DEFAULT_BACKUP_TIME, DEFAULT_BACKUP_TIMEZONE } from "./backup-schedule";

type Actor = { id: number; fullName: string };
export const backupTimezone = () => process.env.BACKUP_TIMEZONE || DEFAULT_BACKUP_TIMEZONE;
type Executor = Pick<typeof db, "insert">;
async function setting(executor: Executor, key: string, value: string) {
  await executor.insert(systemSettings).values({ key, value, description: "Suivi des sauvegardes automatiques" })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date().toISOString() } });
}

/** Verrou PostgreSQL commun à toutes les instances, rollback et purge après succès. */
type BackupOptions = { force?: boolean; actor?: Actor; source?: "server" | "cron" | "browser" | "manual" };
export async function runAutomaticBackup(options: BackupOptions = {}, retries = 2): Promise<{ ok: boolean; skipped?: boolean; reason?: string; id?: number; filename?: string; totalRecords?: number; filesize?: number; deletedOldBackups?: number }> {
  const { force = false, actor, source = "server" } = options;
  try {
    return await db.transaction(async (tx) => {
      const lock = await tx.execute<{ locked: boolean }>(sql`SELECT pg_try_advisory_xact_lock(746201, 1) AS locked`);
      if (!lock.rows[0]?.locked) return { ok: false, skipped: true, reason: "Sauvegarde déjà en cours" };
      const now = new Date();
      // Ce checkpoint commun est écrit AVANT toute lecture de données. En repeatable-read,
      // un snapshot antérieur à la fin d'une autre sauvegarde provoque 40001 : on retente
      // avec un snapshot frais, au lieu de valider une seconde sauvegarde de l'échéance.
      await setting(tx, "backup_last_scheduler_check", now.toISOString());
      await setting(tx, "backup_last_trigger", source);
      if (source === "cron") await setting(tx, "backup_last_cron_check", now.toISOString());
      const settings = Object.fromEntries((await tx.select().from(systemSettings)).map((row) => [row.key, row.value]));
      if (!force && settings.backup_enabled === "false") return { ok: false, skipped: true, reason: "Sauvegarde automatique désactivée" };
      const [lastSuccess] = await tx.select({ createdAt: backupHistory.createdAt }).from(backupHistory)
        .where(and(eq(backupHistory.type, "automatic"), eq(backupHistory.status, "success")))
        .orderBy(desc(backupHistory.createdAt)).limit(1);
      const due = backupDue({ now, time: settings.backup_time || DEFAULT_BACKUP_TIME, timeZone: backupTimezone(), lastSuccess: lastSuccess?.createdAt, lastAttempt: settings.backup_last_run, lastStatus: settings.backup_last_status });
      if (!force && !due.due) return { ok: false, skipped: true, reason: due.reason };
      const { data, totalRecords } = await collectBackupData(tx);
      const filename = `Backup_${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      const backupJson = JSON.stringify({ meta: { app: "OrderTrack Pro", version: 1, createdAt: now.toISOString(), createdBy: actor?.fullName || "Système (automatique)", totalRecords, type: "automatic", scheduledDay: due.day, timeZone: backupTimezone(), tables: Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length])) }, data }, null, 2);
      const filesize = Buffer.byteLength(backupJson, "utf8");
      const [created] = await tx.insert(backupHistory).values({ filename, filesize, totalRecords, type: "automatic", status: "success", backupData: backupJson, createdAt: now.toISOString(), createdById: actor?.id || null, createdByName: actor?.fullName || "Système" }).returning({ id: backupHistory.id });
      await setting(tx, "backup_last_run", now.toISOString());
      await setting(tx, "backup_last_success", now.toISOString());
      await setting(tx, "backup_last_status", "success");
      // La nouvelle sauvegarde et la purge sont atomiques : un échec ne détruit pas les anciennes.
      const previous = await tx.select({ id: backupHistory.id }).from(backupHistory)
        .where(and(eq(backupHistory.type, "automatic"), eq(backupHistory.status, "success")))
        .orderBy(desc(backupHistory.createdAt), desc(backupHistory.id));
      const obsolete = previous.slice(backupRetention(settings.backup_max_count));
      if (obsolete.length) await tx.delete(backupHistory).where(inArray(backupHistory.id, obsolete.map((row) => row.id)));
      return { ok: true, id: created.id, filename, totalRecords, filesize, deletedOldBackups: obsolete.length };
    }, { isolationLevel: "repeatable read" });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    const code = databaseError.code || databaseError.cause?.code;
    if (retries > 0 && (code === "40001" || code === "40P01")) return runAutomaticBackup(options, retries - 1);
    console.error("[Backup] Échec sauvegarde automatique:", error);
    const message = error instanceof Error ? error.message : String(error);
    try {
      await db.insert(backupHistory).values({ filename: `Backup_FAILED_${Date.now()}.json`, totalRecords: 0, type: "automatic", status: "error", errorMessage: message, createdById: actor?.id || null, createdByName: actor?.fullName || "Système" });
      const failedAt = new Date().toISOString();
      await setting(db, "backup_last_scheduler_check", failedAt);
      if (source === "cron") await setting(db, "backup_last_cron_check", failedAt);
      await setting(db, "backup_last_run", failedAt);
      await setting(db, "backup_last_status", `error: ${message}`);
    } catch (historyError) { console.error("[Backup] Historique indisponible:", historyError); }
    throw error;
  }
}
