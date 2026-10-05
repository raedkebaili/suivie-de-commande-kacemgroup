// ── Limitation de débit en mémoire — CORRECTIF SÉCURITÉ (R4) ──────────
// Protège les endpoints sensibles (notamment POST /api/auth/login) contre
// la force brute. Fenêtre glissante par clé, stockée en mémoire (processus
// unique — adapté au déploiement LAN mono-instance).

type Bucket = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __rateLimitBuckets: Map<string, Bucket> | undefined;
}

function buckets(): Map<string, Bucket> {
  if (!globalThis.__rateLimitBuckets) {
    globalThis.__rateLimitBuckets = new Map();
    // Nettoyage périodique des entrées expirées (anti-fuite mémoire)
    const gc = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of globalThis.__rateLimitBuckets!) {
        if (bucket.resetAt <= now) globalThis.__rateLimitBuckets!.delete(key);
      }
    }, 60_000);
    // Ne jamais bloquer l'arrêt du processus
    if (typeof gc.unref === "function") gc.unref();
  }
  return globalThis.__rateLimitBuckets;
}

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

/**
 * Consomme un essai pour la clé donnée.
 * @param maxAttempts nombre d'essais autorisés dans la fenêtre
 * @param windowMs    durée de la fenêtre en millisecondes
 */
export function consumeRateLimit(key: string, maxAttempts: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const store = buckets();
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > maxAttempts) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Réinitialise le compteur d'une clé (ex. après un login réussi). */
export function resetRateLimit(key: string): void {
  globalThis.__rateLimitBuckets?.delete(key);
}

/** Adresse IP cliente (derrière proxy ou en direct). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "local";
}
