import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// ── Connexion paresseuse (lazy) ─────────────────────────────────────
// Le pool et le client Drizzle ne sont créés qu'au premier appel.
// Cela permet au build Next.js de réussir même si DATABASE_URL
// n'est pas disponible au moment du build (ex: Vercel).
// En production, la connexion est créée à la première requête API.

const globalForDb = globalThis as typeof globalThis & {
  __pool?: Pool;
  __db?: NodePgDatabase<typeof schema>;
};

function getPool(): Pool {
  if (globalForDb.__pool) return globalForDb.__pool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Set it in .env or in the deployment environment variables."
    );
  }

  const p = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DB_POOL_MAX) || 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Neon/Supabase/Railway nécessitent SSL en production
    ssl: databaseUrl.includes("sslmode=require") || databaseUrl.includes("neon.tech") || databaseUrl.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  globalForDb.__pool = p;
  return p;
}

function getDb(): NodePgDatabase<typeof schema> {
  if (globalForDb.__db) return globalForDb.__db;
  const d = drizzle(getPool(), { schema });
  globalForDb.__db = d;
  return d;
}

// Proxy qui crée la connexion seulement quand on accède à une propriété
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getPool() as any)[prop];
  },
});

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as any)[prop];
  },
});
