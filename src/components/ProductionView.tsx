"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { normalizePlanningSearch } from "@/lib/planning-list";
import PlanningOverview from "@/components/PlanningOverview";
import { WORKFLOW_FILTERS } from "@/lib/workflow-filters";
import { apiFetch } from "@/lib/api";
import type { User, ProductionBatch } from "@/lib/types";
import { priorityColorKey, priorityLabel, prioritySortRank } from "@/lib/priority";
import { useColors } from "@/lib/color-context";
import { darkenColor, getContrastTextColor } from "@/lib/color-utils";
import {
  getOrderVisualState,
  ORDER_STATE_LABELS,
  ORDER_STATE_PANEL_CLASSES,
} from "@/lib/order-visual-state";

type Item = {
  itemId: number;
  orderId: number;
  articleName: string;
  quantity: number;
  producedQty: number;
  deliveredQty: number;
  orderNumber: string;
  clientName: string | null;
  agencyName: string | null;
  priority: string;
  status: string;
  productionStatus: string | null;
  affaire: string | null;
};

export default function ProductionView({ user: _user }: { user: User }) {
  const [matchingItemIds, setMatchingItemIds] = useState<number[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchQtys, setBatchQtys] = useState<Record<number, string>>({});
  const [batchDates, setBatchDates] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  // Couleurs de priorité pilotées par le gestionnaire de couleurs existant
  const { getColor } = useColors();
  const priorityBadgeStyle = (p: string): React.CSSProperties => {
    const bg = getColor(priorityColorKey(p));
    return { backgroundColor: bg, color: getContrastTextColor(bg), borderColor: darkenColor(bg, 20) };
  };

  const activeFilter = useRef(stateFilter), requestVersion = useRef(0);
  const [loadError, setLoadError] = useState("");
  const fetchData = useCallback(async () => {
    const version = ++requestVersion.current;
    const selected = activeFilter.current;
    setLoading(true); setLoadError("");
    try {
    const data = await apiFetch<{ items: Item[]; matchingItemIds?: number[] | null; batches: ProductionBatch[] }>(`/api/production${selected.startsWith("workflow:") ? `?workflow=${encodeURIComponent(selected.slice(9))}` : ""}`);
    if (version !== requestVersion.current) return;
    setItems(data.items);
    setMatchingItemIds(data.matchingItemIds ?? null);
    setBatches(data.batches || []);
    } catch (error) { if (version === requestVersion.current) setLoadError(error instanceof Error ? error.message : "Chargement impossible"); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, []);

  useEffect(() => {
    activeFilter.current = stateFilter;
    void fetchData();
    return () => { requestVersion.current += 1; };
  }, [fetchData, stateFilter]);

  const toggle = (orderId: number) => {
    const next = new Set(expanded);
    next.has(orderId) ? next.delete(orderId) : next.add(orderId);
    setExpanded(next);
  };

  const addBatch = async (itemId: number) => {
    const quantity = batchQtys[itemId];
    if (!quantity || parseInt(quantity) <= 0) return;
    try {
      await apiFetch("/api/production", {
        method: "POST",
        body: JSON.stringify({
          itemId,
          batchQty: parseInt(quantity),
          productionDate: batchDates[itemId] || new Date().toISOString().split("T")[0],
        }),
      });
      setBatchQtys(current => ({ ...current, [itemId]: "" }));
      fetchData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erreur");
    }
  };

  const orders = [...new Set(items.map(item => item.orderId))].map(orderId => {
    const orderItems = items.filter(item => item.orderId === orderId);
    const first = orderItems[0];
    const totalOrdered = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalProduced = orderItems.reduce((sum, item) => sum + (item.producedQty || 0), 0);
    const totalDelivered = orderItems.reduce((sum, item) => sum + (item.deliveredQty || 0), 0);
    const visualState = getOrderVisualState({
      productionStatus: first.productionStatus,
      ordered: totalOrdered,
      produced: totalProduced,
      delivered: totalDelivered,
    });
    return {
      orderId,
      orderNumber: first.orderNumber,
      clientName: first.clientName,
      affaire: first.affaire,
      productionStatus: first.productionStatus,
      priority: first.priority,
      items: orderItems,
      totalOrdered,
      totalProduced,
      totalDelivered,
      visualState,
    };
  })
  // File de production : Priorité 1 d'abord … puis Priorité 10, puis Normale.
  // À priorité égale, l'ordre d'origine (plus récent en premier) est conservé.
  .sort((a, b) => prioritySortRank(a.priority) - prioritySortRank(b.priority));

  const matchingIds = matchingItemIds === null ? null : new Set(matchingItemIds);
  const queryWords = normalizePlanningSearch(search).split(/\s+/).filter(Boolean);
  const selectedOrders = orders.map(order => ({ ...order, items: order.items.filter(item => {
    if (matchingIds && !matchingIds.has(item.itemId)) return false;
    const text = normalizePlanningSearch([order.orderNumber, order.clientName, order.affaire, item.articleName,
    ].join(" "));
    return queryWords.every(word => text.includes(word));
  }) }));
  const visibleOrders = (loadError ? [] : selectedOrders).filter(order => order.items.length > 0);

  return (
    <div className="space-y-3 text-black operational-content">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-black">🏭 Production</h3>
        <button onClick={fetchData} className="px-3 py-1.5 bg-gray-200 border border-gray-400 rounded-lg text-sm text-black">🔄 Actualiser</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl p-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher commande, client, affaire ou article…" className="min-w-[220px] flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-black" />
        <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-black">
          <option value="all">Tous les états</option>
          {WORKFLOW_FILTERS.map(filter => <option key={filter.key} value={`workflow:${filter.key}`}>{filter.group} — {filter.label}</option>)}
        </select>
        <span className="text-xs text-gray-500">{visibleOrders.length} commande(s) · {visibleOrders.reduce((total, order) => total + order.items.length, 0)} article(s) affiché(s)</span>
      </div>

      <p className="text-xs text-gray-600">Le filtre affiche les articles concernés. Les totaux et l’état d’en-tête restent ceux de la commande complète ; les lignes de planning et leurs dates sont consultables dans le bilan global ci-dessous.</p>
      <PlanningOverview kind="production" />

      {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
      {loading ? (
        <div className="flex justify-center py-12 text-black">Chargement...</div>
      ) : (
        <div className="space-y-2">
          {visibleOrders.length === 0 && <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">Aucune commande ne correspond aux filtres.</div>}
          {visibleOrders.map(order => (
            <div
              key={order.orderId}
              className={`rounded-xl border-2 overflow-hidden text-black ${ORDER_STATE_PANEL_CLASSES[order.visualState]}`}
            >
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer text-black"
                onClick={() => toggle(order.orderId)}
              >
                <span className="font-bold text-black">{expanded.has(order.orderId) ? "▾" : "▸"}</span>
                <span className="font-semibold text-black">#{order.orderNumber}</span>
                <span className="text-sm text-black">{order.clientName}</span>
                {order.affaire && <span className="text-xs text-black">Aff: {order.affaire}</span>}
                {/* Niveau de priorité : indispensable au planificateur pour suivre la file */}
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold border border-black/20" style={priorityBadgeStyle(order.priority)}>
                  {priorityLabel(order.priority)}
                </span>
                {/* Le libellé « En cours » (état neutre) n'est plus affiché ici :
                    il n'apporte pas d'information au planificateur. Les autres
                    états (En attente de livraison, Livrée, Annulée) restent visibles.
                    ORDER_STATE_LABELS n'est pas modifié : les onglets Commandes et
                    Expédition conservent leur affichage d'origine. */}
                {order.visualState !== "neutral" && (
                  <span className="px-2 py-1 rounded-md bg-white/70 border border-black/20 text-xs font-bold text-black">
                    {ORDER_STATE_LABELS[order.visualState]}
                  </span>
                )}
                <div className="flex-1" />
                <span className="text-xs text-black">Cmd: <b>{order.totalOrdered}</b></span>
                <span className="text-xs text-black">Prod: <b>{order.totalProduced}</b></span>
                <span className="text-xs text-black">Livré: <b>{order.totalDelivered}</b></span>
                <div className="w-24 bg-white/60 border border-black/20 rounded-full h-2">
                  <div
                    className="bg-black rounded-full h-full"
                    style={{ width: `${Math.min(100, order.totalOrdered > 0 ? (order.totalProduced / order.totalOrdered) * 100 : 0)}%` }}
                  />
                </div>
              </div>

              {expanded.has(order.orderId) && (
                <div className="border-t border-black/20 px-4 py-2 space-y-2 text-black">
                  {order.items.map(item => {
                    const remaining = Math.max(0, item.quantity - (item.producedQty || 0));
                    const productionDone = remaining === 0;
                    const cancelled = order.visualState === "cancelled";
                    const itemState = cancelled
                      ? "cancelled"
                      : (item.deliveredQty || 0) >= item.quantity
                        ? "delivered"
                        : productionDone
                          ? "awaiting-delivery"
                          : "neutral";
                    return (
                      <div
                        key={item.itemId}
                        className={`flex items-center gap-3 text-xs py-2 px-2 rounded-lg border text-black ${ORDER_STATE_PANEL_CLASSES[itemState]}`}
                      >
                        <span className="w-32 truncate font-medium text-black">{item.articleName}</span>
                        <span className="text-black">Cmd: <b>{item.quantity}</b></span>
                        <span className="text-black">Prod: <b>{item.producedQty || 0}</b></span>
                        <span className="text-black">Reste: <b>{remaining}</b></span>

                        {!productionDone && !cancelled && (
                          <>
                            <input
                              type="number"
                              min={1}
                              max={remaining}
                              placeholder="Qté"
                              value={batchQtys[item.itemId] || ""}
                              onChange={event => setBatchQtys(current => ({ ...current, [item.itemId]: event.target.value }))}
                              className="w-16 px-1.5 py-1 border border-black/30 rounded text-sm bg-white text-black"
                            />
                            <input
                              type="date"
                              value={batchDates[item.itemId] || new Date().toISOString().split("T")[0]}
                              onChange={event => setBatchDates(current => ({ ...current, [item.itemId]: event.target.value }))}
                              className="px-1.5 py-1 border border-black/30 rounded text-sm bg-white text-black"
                            />
                            <button onClick={() => addBatch(item.itemId)} className="px-2 py-1 bg-amber-500 border border-amber-800 text-black rounded text-xs font-semibold">
                              + Produire
                            </button>
                          </>
                        )}

                        {cancelled && <span className="font-bold text-black">Annulée</span>}
                        {!cancelled && productionDone && (item.deliveredQty || 0) < item.quantity && (
                          <span className="font-bold text-black">En attente de livraison</span>
                        )}
                        {!cancelled && (item.deliveredQty || 0) >= item.quantity && <span className="font-bold text-black">Livrée</span>}

                        {batches.filter(batch => batch.itemId === item.itemId).length > 0 && (
                          <div className="w-full flex gap-1 flex-wrap mt-1 text-black">
                            <span className="text-[9px] text-black">Historique :</span>
                            {batches.filter(batch => batch.itemId === item.itemId).map(batch => (
                              <span key={batch.id} className="text-[9px] bg-white/70 border border-black/20 px-1.5 py-0.5 rounded text-black" title={`${batch.productionDate} par ${batch.producedBy}`}>
                                {batch.productionDate}: {batch.quantity > 0 ? "+" : ""}{batch.quantity}{batch.quantity < 0 ? " (correction)" : ""}→{batch.cumulativeTotal}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
