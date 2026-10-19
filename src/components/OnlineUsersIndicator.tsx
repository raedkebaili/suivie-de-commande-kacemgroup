"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
/** Ne monter ce composant que pour le Super Admin ; l'API protège aussi la lecture. */
export default function OnlineUsersIndicator() {
  const [counts, setCounts] = useState<{ online: number; active: number } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try { const data = await apiFetch<{ online: number; active: number }>("/api/presence"); if (active) { setCounts(data); setUnavailable(false); } }
      catch { if (active) setUnavailable(true); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" title="Utilisateurs distincts ayant envoyé un signal dans les 3 dernières minutes / comptes activés. Actualisation toutes les 30 secondes.">
    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${unavailable ? "bg-amber-500" : "bg-emerald-500"}`} />
    {unavailable ? "Présence indisponible" : counts ? `${counts.online} en ligne / ${counts.active} actifs` : "Présence…"}
  </span>;
}
