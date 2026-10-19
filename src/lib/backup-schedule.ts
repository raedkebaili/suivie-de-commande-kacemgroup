/** Calcul pur, commun à tous les déclencheurs ; aucune dépendance au fuseau serveur. */
export const DEFAULT_BACKUP_TIME = "22:00";
export const DEFAULT_BACKUP_TIMEZONE = "Africa/Tunis";
export const BACKUP_RETRY_DELAY_MS = 10 * 60_000;
export function backupRetention(value?: string): number {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 365 ? count : 30;
}
function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
/** Date de la dernière échéance : aujourd'hui après l'heure, sinon hier (rattrapage). */
export function scheduledBackupDay(now: Date, planned = DEFAULT_BACKUP_TIME, timeZone = DEFAULT_BACKUP_TIMEZONE): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(planned)) throw new Error("Heure de sauvegarde invalide");
  const local = localParts(now, timeZone);
  if (local.time >= planned) return local.day;
  const previous = new Date(`${local.day}T12:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}
export function backupDue({ now = new Date(), time = DEFAULT_BACKUP_TIME, timeZone = DEFAULT_BACKUP_TIMEZONE, lastSuccess, lastAttempt, lastStatus }: { now?: Date; time?: string; timeZone?: string; lastSuccess?: string | null; lastAttempt?: string | null; lastStatus?: string | null }) {
  const day = scheduledBackupDay(now, time, timeZone);
  if (lastSuccess && Number.isFinite(Date.parse(lastSuccess)) && scheduledBackupDay(new Date(lastSuccess), time, timeZone) >= day) return { due: false, day, reason: "Échéance déjà sauvegardée" };
  if (lastStatus?.startsWith("error") && lastAttempt && now.getTime() - Date.parse(lastAttempt) < BACKUP_RETRY_DELAY_MS) return { due: false, day, reason: "Nouvelle tentative autorisée après dix minutes" };
  return { due: true, day, reason: "Échéance à sauvegarder" };
}
