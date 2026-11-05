"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import OrderArticleMarkers from "@/components/OrderArticleMarkers";
import { WORKFLOW_FILTERS, appendOrderStateFilter } from "@/lib/workflow-filters";
import { getOrderVisualState } from "@/lib/order-visual-state";
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
  items?: { workflowReady?: boolean; expeditionPlanStatus?: string | null; quantity: number; producedQty?: number; deliveredQty?: number }[];
  totalProduced?: number;
  totalQty?: number;
  totalDelivered?: number;
};

const PAGE_SIZE = 30;

/** Liste des commandes en cartes, avec recherche et filtres tactiles */
export default function MobileOrders({ user, onCreate, onOpen, onSessionExpired }: { user: User; onCreate: () => void; onOpen: (id: number) => void; onSessionExpired: () => void }) {
  const { getBadgeStyle } = useColors();
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [productionStatus, setProductionStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const params = new URLSearchParams(); appendOrderStateFilter(params, productionStatus);
      const d = await apiFetch<{ orders: OrderCard[] }>(`/api/orders${params.size ? `?${params}` : ""}`);
      if (version !== requestVersion.current) return;
      setOrders(d.orders);
      setError("");
    } catch (err) {
      if (version !== requestVersion.current) return;
      const message = err instanceof Error ? err.message : "Erreur de chargement";
      if (message === "Non authentifié") { onSessionExpired(); return; }
      if (version === requestVersion.current) { setOrders([]); setError(message); }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [onSessionExpired, productionStatus]);

  useEffect(() => { void load(); return () => { requestVersion.current += 1; }; }, [load]);
  useEffect(() => { setVisible(PAGE_SIZE); }, [query, productionStatus, priority]);

  const filtered = useMemo(
    () => filterMobileOrders(orders, { query, productionStatus: "", priority }),
    [orders, query, priority],
  );
  const shown = loading ? [] : filtered.slice(0, visible);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Commandes</h1>
        <button onClick={load} className={btnGhost}>{loading ? "…" : "🔄 Actualiser"}</button>
      </div>

      {["superadmin", "commercial", "planification"].includes(user.role) && <button type="button" className="min-h-[48px] w-full rounded-xl bg-blue-600 text-white font-semibold" onClick={onCreate}>Nouvelle commande</button>}
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

      <select aria-label="Filtrer par état" value={productionStatus} onChange={event => setProductionStatus(event.target.value)} className={fieldClass}>
        <option value="">Tous les états</option>
        <optgroup label="État commercial"><option value="comm:PREVISION">Prévision</option><option value="comm:BON_COMMANDE">Bon de commande</option><option value="comm:SUR_STOCK">Sur stock / besoin interne</option></optgroup>
        {[...new Set(WORKFLOW_FILTERS.map(filter => filter.group))].map(group => <optgroup key={group} label={group}>{WORKFLOW_FILTERS.filter(filter => filter.group === group).map(filter => <option key={filter.key} value={`workflow:${filter.key}`}>{filter.label}</option>)}</optgroup>)}
      </select>

      <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filtrer par priorité" className={fieldClass}>
        <option value="">Toutes les priorités</option>
        {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>

      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-xs text-slate-500 dark:text-slate-400">{filtered.length} commande(s) sur {orders.length}</p>

      <ul className="space-y-3">
        {shown.map((o) => {
          const visual = getOrderVisualState({ productionStatus: o.productionStatus, ordered: o.totalQty || 0, produced: o.totalProduced || 0, delivered: o.totalDelivered || 0 });
          const shipping = visual !== "cancelled" && visual !== "delivered" && (Boolean(o.items?.some(item => item.expeditionPlanStatus === "EN_COURS")) || (o.totalDelivered || 0) > 0);
          const state = visual === "awaiting-delivery" || shipping ? "VISUAL_AWAITING" : o.productionStatus || "EN_INSTANCE";
          const stateLabel = shipping ? "En cours de livraison" : visual === "awaiting-delivery" ? "Prête à livrer" : MOBILE_PRODUCTION_STATES.find(value => value.value === state)?.label || state;
          return (
            <li key={o.id}>
              <button
                onClick={() => onOpen(o.id)}
                className="w-full text-left rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-4 active:bg-slate-50 dark:active:bg-slate-700 min-h-[44px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-bold">{o.orderNumber}<OrderArticleMarkers items={o.items || []} cancelled={o.productionStatus === "ANNULEE" || o.status === "ANNULEE"} /></div>
                    <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{o.clientName || "Client inconnu"}</div>
                  </div>
                  <StatePill style={getBadgeStyle(state)}>{stateLabel}</StatePill>
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
      {loading && <div className="py-10 text-center text-sm text-slate-500">Chargement…</div>}
    </div>
  );
}
