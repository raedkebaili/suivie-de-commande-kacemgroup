/**
 * Instrumentation Next.js — CORRECTIF (R3) : planificateur de sauvegarde
 * automatique CÔTÉ SERVEUR.
 *
 * Avant : la sauvegarde automatique ne se déclenchait que si un navigateur
 * superadmin restait ouvert (src/lib/backup-scheduler.ts — conservé pour
 * l'écriture dans un dossier local).
 * Désormais : le serveur vérifie chaque minute si l'heure planifiée
 * (system_settings.backup_time) est atteinte et déclenche
 * POST /api/backup/auto avec le secret interne. Idempotent par jour :
 * backup_last_run compare la DATE d'exécution, pas l'heure exacte.
 */

const globalForScheduler = globalThis as typeof globalThis & {
  __backupServerScheduler?: boolean;
};

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (globalForScheduler.__backupServerScheduler) return;
  globalForScheduler.__backupServerScheduler = true;

  const CHECK_INTERVAL_MS = 60_000;

  const tick = async () => {
    try {
      // Résolution tardive : ne rien faire tant que l'application n'est pas configurée.
      if (!process.env.DATABASE_URL) return;
      const port = process.env.PORT || "3000";
      const base = `http://127.0.0.1:${port}`;

      // Lire l'heure planifiée via le statut public le plus léger possible :
      // on interroge la base directement pour éviter toute dépendance à un token.
      const { db } = await import("@/db");
      const { systemSettings } = await import("@/db/schema");

      const rows = await db.select().from(systemSettings);
      if (rows.length === 0) return; // aucun paramètre : l'app n'a pas encore amorcé
      const map: Record<string, string> = {};
      for (const row of rows) map[row.key] = row.value;

      if (map["backup_enabled"] !== "true") return;
      const planned = map["backup_time"]; // "HH:MM"
      if (!planned || !/^\d{2}:\d{2}$/.test(planned)) return;

      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      if (`${hh}:${mm}` !== planned) return;

      const today = now.toISOString().slice(0, 10);
      const lastRun = map["backup_last_run"] || "";
      if (lastRun.startsWith(today)) return; // déjà exécutée aujourd'hui

      const secret = process.env.BACKUP_SECRET || process.env.JWT_SECRET || "";
      if (!secret) return;

      console.log(`[BackupScheduler] Déclenchement sauvegarde automatique (${today} ${planned})`);
      const res = await fetch(`${base}/api/backup/auto`, {
        method: "POST",
        headers: { "x-backup-secret": secret, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[BackupScheduler] Sauvegarde OK: ${json.filename || "?"} (${json.totalRecords ?? "?"} enregistrements)`);
      } else {
        console.error(`[BackupScheduler] Échec (${res.status}):`, json.error || res.statusText);
      }
    } catch (error) {
      // Ne jamais faire échouer le serveur pour une tâche de fond.
      const code = (error as { cause?: { code?: string } })?.cause?.code || "";
      if (code !== "42P01" && code !== "ECONNREFUSED") {
        console.error("[BackupScheduler] Erreur:", error);
      }
    }
  };

  // Première vérification différée (laisser le serveur finir de démarrer),
  // puis toutes les minutes.
  const first = setTimeout(() => { void tick(); }, 15_000);
  const interval = setInterval(() => { void tick(); }, CHECK_INTERVAL_MS);
  if (typeof first.unref === "function") first.unref();
  if (typeof interval.unref === "function") interval.unref();
  console.log("[BackupScheduler] Planificateur serveur démarré (vérification chaque minute)");
}
