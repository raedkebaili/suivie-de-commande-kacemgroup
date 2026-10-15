import type { MetadataRoute } from "next";

/**
 * Manifeste PWA (Android, iPhone, navigateurs de bureau).
 * start_url pointe sur la version mobile : l'application installée s'ouvre sur /mobile.
 * Aucune donnée sensible : uniquement le nom, les icônes et les couleurs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Order Track Pro",
    short_name: "Order Track",
    description: "Suivi des commandes, planning de production et expéditions",
    id: "/mobile",
    start_url: "/mobile",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#1e293b",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
