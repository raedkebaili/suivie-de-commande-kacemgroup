import { db } from "@/db";
import { sql } from "drizzle-orm";
export const ONLINE_WINDOW_SECONDS = 180;
let initialized: Promise<unknown> | undefined;
/** Idempotent au déploiement ; la migration SQL est fournie pour les comptes DB restreints. */
export async function ensurePresenceTable() {
  if (!initialized) initialized = db.execute(sql`CREATE TABLE IF NOT EXISTS user_presence (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id uuid NOT NULL,
    last_seen timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, client_id)
  )`).catch((error) => { initialized = undefined; throw error; });
  await initialized;
}
export function validPresenceClient(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export async function recordPresence(userId: number, clientId: string, offline = false) {
  await ensurePresenceTable();
  if (offline) {
    await db.execute(sql`DELETE FROM user_presence WHERE user_id = ${userId} AND client_id = ${clientId}::uuid`);
    return;
  }
  await db.execute(sql`INSERT INTO user_presence (user_id, client_id, last_seen) VALUES (${userId}, ${clientId}::uuid, now())
    ON CONFLICT (user_id, client_id) DO UPDATE SET last_seen = now()`);
  await db.execute(sql`DELETE FROM user_presence WHERE last_seen < now() - interval '1 day'`);
}
export async function presenceCounts() {
  await ensurePresenceTable();
  const result = await db.execute<{ online: number; active: number }>(sql`
    SELECT (SELECT count(DISTINCT p.user_id)::int FROM user_presence p JOIN users u ON u.id = p.user_id
      WHERE u.active = true AND p.last_seen >= now() - make_interval(secs => ${ONLINE_WINDOW_SECONDS})) AS online,
      (SELECT count(*)::int FROM users WHERE active = true) AS active`);
  return { online: result.rows[0]?.online || 0, active: result.rows[0]?.active || 0, windowSeconds: ONLINE_WINDOW_SECONDS, checkedAt: new Date().toISOString() };
}
