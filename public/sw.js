/*
 * Service worker minimal — Order Track Pro.
 *
 * Règles de sécurité (ne pas élargir sans revue) :
 *  - AUCUNE réponse de l'API (/api/...) n'est mise en cache ni interceptée.
 *  - AUCUNE page HTML / navigation n'est mise en cache (données commandes privées).
 *  - Seuls les fichiers statiques versionnés par Next.js (/_next/static/) et les icônes
 *    sont mis en cache ; ce sont des fichiers publics, identiques pour tous les utilisateurs.
 *  - Les téléchargements de fichiers (GET /api/...) passent directement au réseau.
 * Hors ligne : NON pris en charge. L'application nécessite une connexion.
 */
const CACHE = "otp-static-v1";
const STATIC_PREFIXES = ["/_next/static/", "/icons/"];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("otp-static-") && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // réseau direct, jamais de cache
  if (!STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) return; // navigation : réseau direct

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  })());
});
