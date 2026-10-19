/** Les serveurs persistants utilisent une minuterie ; Vercel utilise son Cron HTTP. */
const globalScheduler = globalThis as typeof globalThis & { __backupServerScheduler?: boolean };
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL || process.env.NEXT_PHASE === "phase-production-build") return;
  if (globalScheduler.__backupServerScheduler) return;
  globalScheduler.__backupServerScheduler = true;
  let running = false;
  const tick = async () => {
    if (running || !process.env.DATABASE_URL) return;
    running = true;
    try {
      const { runAutomaticBackup } = await import("@/lib/automatic-backup");
      await runAutomaticBackup({ source: "server" });
    } catch (error) { console.error("[BackupScheduler] Échec de la vérification:", error); }
    finally { running = false; }
  };
  const first = setTimeout(() => { void tick(); }, 15_000);
  const interval = setInterval(() => { void tick(); }, 60_000);
  first.unref?.(); interval.unref?.();
}
