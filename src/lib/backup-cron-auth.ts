import { timingSafeEqual } from "node:crypto";
/** Un secret de cron dédié, jamais le secret de signature des sessions. */
export function matchesBackupSecret(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
