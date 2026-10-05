import type { NextConfig } from "next";

// ── En-têtes de sécurité — CORRECTIF (R6) ────────────────────────────────
// Politique appliquée à toutes les réponses HTTP.
const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

// Content-Security-Policy : scripts/styles auto-hébergés. 'unsafe-inline' est
// requis par l'hydratation Next.js ; aucune source externe n'est autorisée.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // ── Production : écouter sur toutes les interfaces réseau (0.0.0.0) ──
  // Cela permet l'accès depuis d'autres postes du réseau local.
  // En développement, Next.js écoute déjà sur localhost.

  // ── Origines autorisées en développement (HMR websocket) ──
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.0.199",
    ...(process.env.NEXT_ALLOWED_DEV_ORIGINS
      ? process.env.NEXT_ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
      : []),
  ],

  // ── Optimisations de production ──
  poweredByHeader: false,  // Ne pas révéler le framework en production
  compress: true,          // Compression gzip

  // ── En-têtes de sécurité (CORRECTIF R6) ──
  // La CSP est appliquée partout SAUF à la page de rappel OAuth Google Drive,
  // qui embarque volontairement un petit HTML inline auto-fermant.
  async headers() {
    return [
      {
        source: "/((?!api/google-drive/oauth/callback).*)",
        headers: [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: CSP }],
      },
      {
        source: "/api/google-drive/oauth/callback",
        headers: [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" }],
      },
    ];
  },

  // ── Stabilité ──
  reactStrictMode: true,
};

export default nextConfig;
