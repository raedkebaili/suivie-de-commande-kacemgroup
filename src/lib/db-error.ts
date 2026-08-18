// Small helper to turn low-level PostgreSQL errors into actionable messages.
// Most common case during local setup: the schema hasn't been pushed yet,
// so tables (relations) don't exist and every query fails with code 42P01.

type PgLikeError = { code?: string; message?: string; cause?: unknown };

function unwrap(error: unknown): PgLikeError | null {
  if (!error || typeof error !== "object") return null;
  const err = error as PgLikeError;
  if (err.code) return err;
  if (err.cause) return unwrap(err.cause);
  return null;
}

export function friendlyDbErrorMessage(error: unknown): string {
  const pgErr = unwrap(error);

  if (pgErr?.code === "42P01") {
    return "La base de données n'a pas encore de schéma (tables manquantes). Exécutez `npx drizzle-kit push` (ou relancez setup.sh / setup.bat) pour créer les tables, puis réessayez.";
  }
  if (pgErr?.code === "ECONNREFUSED" || pgErr?.code === "3D000") {
    return "Impossible de se connecter à la base de données PostgreSQL. Vérifiez que le serveur est démarré et que DATABASE_URL dans .env pointe vers une base existante.";
  }
  if (pgErr?.code === "28P01") {
    return "Authentification PostgreSQL refusée. Vérifiez l'utilisateur et le mot de passe dans DATABASE_URL (.env).";
  }

  return error instanceof Error ? error.message : String(error);
}
