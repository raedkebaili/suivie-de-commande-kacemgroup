"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useColors } from "@/lib/color-context";
import { priorityLabel, PRIORITY_OPTIONS } from "@/lib/priority";
import { filterMobileOrders, MOBILE_PRODUCTION_STATES } from "@/lib/mobile-orders";
import type { User } from "@/lib/types";
import { Notice, StatePill, fieldClass, fmtDay, btnGhost } from "@/components/mobile/ui";

type OrderCard = {
  id: number;
  orderNumber: string;
  orderDate: string;
  priority: string;
  status: string;
  productionStatus: string | null;
  affaire: string | null;
  clientName: string | null;
  agencyName: string | null;
  totalQty?: number;
  totalDelivered?: number;
};

const PAGE_SIZE = 30;

/** Liste des commandes en cartes, avec recherche et filtres tactiles */
export default function MobileOrders({ user, onOpen, onSessionExpired }: { user: User; onOpen: (id: number) => void; onSessionExpired: () => void }) {
  const { getBadgeStyle } = useColors();
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [productionStatus, setProductionStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ orders: OrderCard[] }>("/api/orders");
      setOrders(d.orders);
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
  useEffect(() => { setVisible(PAGE_SIZE); }, [query, productionStatus, priority]);

  const filtered = useMemo(
    () => filterMobileOrders(orders, { query, productionStatus, priority }),
    [orders, query, productionStatus, priority],
  );
  const shown = filtered.slice(0, visible);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Commandes</h1>
        <button onClick={load} className={btnGhost}>{loading ? "…" : "🔄 Actualiser"}</button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher n°, client, agence, affaire"
        aria-label="Rechercher une commande"
        className={fieldClass}
        autoComplete="off"
        enterKeyHint="search"
      />

      {/* Filtres tactiles : défilement horizontal */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" role="group" aria-label="Filtrer par état">
        {[{ value: "", label: "Tous" }, ...MOBILE_PRODUCTION_STATES].map((s) => {
          const active = productionStatus === s.value;
          return (
            <button
              key={s.value || "all"}
              onClick={() => setProductionStatus(s.value)}
              aria-pressed={active}
              className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium border ${active ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900" : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filtrer par priorité" className={fieldClass}>
        <option value="">Toutes les priorités</option>
        {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>

      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-xs text-slate-500 dark:text-slate-400">{filtered.length} commande(s) sur {orders.length}</p>

      <ul className="space-y-3">
        {shown.map((o) => {
          const state = o.productionStatus || "EN_INSTANCE";
          return (
            <li key={o.id}>
              <button
                onClick={() => onOpen(o.id)}
                className="w-full text-left rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-4 active:bg-slate-50 dark:active:bg-slate-700 min-h-[44px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-bold">{o.orderNumber}</div>
                    <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{o.clientName || "Client inconnu"}</div>
                  </div>
                  <StatePill style={getBadgeStyle(state)}>{MOBILE_PRODUCTION_STATES.find((s) => s.value === state)?.label || state}</StatePill>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>📅 {fmtDay(o.orderDate)}</span>
                  <span>🏢 {o.agencyName || "—"}</span>
                  {o.affaire && <span className="truncate max-w-full">📁 {o.affaire}</span>}
                  <span>⚑ {priorityLabel(o.priority)}</span>
                  {typeof o.totalQty === "number" && <span>Qté {o.totalDelivered ?? 0}/{o.totalQty} livrée</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {!loading && filtered.length === 0 && <div className="py-10 text-center text-sm text-slate-500">Aucune commande ne correspond.</div>}
      {filtered.length > visible && (
        <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="w-full min-h-[48px] rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-sm font-medium">
          Afficher plus ({filtered.length - visible} restante(s))
        </button>
      )}
      {loading && orders.length === 0 && <div className="py-10 text-center text-sm text-slate-500">Chargement…</div>}
    </div>
  );
}
