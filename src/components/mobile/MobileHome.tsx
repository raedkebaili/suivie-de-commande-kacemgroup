"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useColors } from "@/lib/color-context";
import type { User } from "@/lib/types";
import { Notice, StatTile, btnPrimary } from "@/components/mobile/ui";

type Dashboard = {
  totalOrders: number;
  productionStatusDistribution: Record<string, number>;
  quantities: { totalOrdered: number; totalProduced: number; totalDelivered: number; totalRemaining: number };
};

const STATE_KEYS = [
  { key: "EN_INSTANCE", label: "En instance" },
  { key: "EN_PRODUCTION", label: "En production" },
  { key: "LIVREE", label: "Livrées" },
  { key: "ANNULEE", label: "Annulées" },
];

/** Tableau de bord mobile simplifié : chiffres réels du serveur, couleurs du gestionnaire. */
export default function MobileHome({ user, onSeeOrders, onSessionExpired }: { user: User; onSeeOrders: () => void; onSessionExpired: () => void }) {
  const { getColor } = useColors();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<Dashboard>("/api/dashboard"));
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de chargement";
      if (message === "Non authentifié") { onSessionExpired(); return; }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => { load(); }, [load]);

  const q = data?.quantities;
  const percentDelivered = q && q.totalOrdered > 0 ? Math.min(100, Math.round((q.totalDelivered / q.totalOrdered) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Bonjour, {user.fullName.split(" ")[0]}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Vue d&apos;ensemble des commandes</p>
        </div>
        <button onClick={load} className="min-h-[44px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
          {loading ? "…" : "🔄"}
        </button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Commandes" value={data.totalOrders} />
            {STATE_KEYS.map((s) => (
              <div key={s.key} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm" style={{ borderLeft: `6px solid ${getColor(s.key)}` }}>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</div>
                <div className="mt-1 text-2xl font-bold">{data.productionStatusDistribution[s.key] ?? 0}</div>
              </div>
            ))}
          </div>

          <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">Quantités</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Commandé" value={q?.totalOrdered ?? 0} tone="text-blue-700" />
              <StatTile label="Produit" value={q?.totalProduced ?? 0} />
              <StatTile label="Livré" value={q?.totalDelivered ?? 0} tone="text-green-700" />
              <StatTile label="Reste à livrer" value={q?.totalRemaining ?? 0} tone="text-orange-600" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1"><span>Avancement des livraisons</span><span>{percentDelivered} %</span></div>
              <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" role="progressbar" aria-valuenow={percentDelivered} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-green-500" style={{ width: `${percentDelivered}%` }} />
              </div>
            </div>
          </section>

          <button onClick={onSeeOrders} className={btnPrimary}>Voir les commandes</button>
        </>
      )}
      {loading && !data && <div className="py-10 text-center text-sm text-slate-500">Chargement…</div>}
    </div>
  );
}
