import type { Metadata } from "next";
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
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#1e293b" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
