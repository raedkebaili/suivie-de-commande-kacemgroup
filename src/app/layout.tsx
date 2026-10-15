import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ColorProvider } from "@/lib/color-context";
import { ModificationsProvider } from "@/lib/modifications-context";

export const metadata: Metadata = {
  title: "OrderTrack Pro - Suivi de Commandes",
  description: "Plateforme de gestion et suivi de commandes",
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  // PWA : manifeste et réglages d'installation iPhone (le bureau reste identique)
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Order Track Pro",
    statusBarStyle: "black-translucent",
  },
};

// Viewport déclaré une seule fois (Next.js ajoute sinon une balise par défaut en plus).
// Mêmes réglages qu'avant + viewport-fit=cover pour les encoches iPhone (safe-area).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta name="theme-color" content="#1e293b" />
      </head>
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen">
        <AuthProvider>
          <ColorProvider>
            <ModificationsProvider>
              {children}
            </ModificationsProvider>
          </ColorProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
