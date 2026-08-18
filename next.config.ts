import type { NextConfig } from "next";

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

  // ── Stabilité ──
  reactStrictMode: true,
};

export default nextConfig;
