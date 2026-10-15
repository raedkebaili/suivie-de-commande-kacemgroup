"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker minimal (public/sw.js) — uniquement depuis la version mobile.
 * Le bureau n'enregistre rien : son comportement reste inchangé.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* non bloquant */ });
  }, []);
  return null;
}
