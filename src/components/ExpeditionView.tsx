"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { normalizePlanningSearch } from "@/lib/planning-list";
import PlanningOverview from "@/components/PlanningOverview";
import { WORKFLOW_FILTERS } from "@/lib/workflow-filters";
import { apiFetch } from "@/lib/api";
import type { User, ExpeditionBatch } from "@/lib/types";
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
  deliveryDate: string | null;
  orderNumber: string;
  clientName: string | null;
  agencyName: string | null;
  priority: string;
  status: string;
  productionStatus: string | null;
  affaire: string | null;
};

type Plan = {
  id: number;
  planDate: string;
  itemId: number;
  articleName: string;
  orderNumber: string | null;
  plannedQty: number;
  loadedQty: number;
  driverName: string;
  status: string;
};

export default function ExpeditionView({ user }: { user: User }) {
  const canManage = user.role === "superadmin" || user.role === "planification";
  const [matchingItemIds, setMatchingItemIds] = useState<number[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [batches, setBatches] = useState<ExpeditionBatch[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedPlans, setSelectedPlans] = useState<Record<number, string>>({});
  const [batchQtys, setBatchQtys] = useState<Record<number, string>>({});
  const [batchDates, setBatchDates] = useState<Record<number, string>>({});
  const [drivers, setDrivers] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loadingDates, setLoadingDates] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const activeFilter = useRef(stateFilter), requestVersion = useRef(0);
  const [loadError, setLoadError] = useState("");
  const fetchData = useCallback(async () => {
    const version = ++requestVersion.current;
    const selected = activeFilter.current;
    setLoading(true); setLoadError("");
    try {
    const data = await apiFetch<{ items: Item[]; matchingItemIds?: number[] | null; batches: ExpeditionBatch[]; plans: Plan[] }>(`/api/expedition${selected.startsWith("workflow:") ? `?workflow=${encodeURIComponent(selected.slice(9))}` : ""}`);
    if (version !== requestVersion.current) return;
    setItems(data.items);
    setMatchingItemIds(data.matchingItemIds ?? null);
    setBatches(data.batches || []);
    setPlans(data.plans || []);
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
    const itemPlanOptions = plans.filter((plan) => plan.itemId === itemId && plan.status !== "ANNULE" && plan.status !== "LIVRE" && plan.status !== "TERMINE");
    const linkedPlanningId = selectedPlans[itemId] || (itemPlanOptions.length === 1 ? String(itemPlanOptions[0].id) : "");
    try {
      await apiFetch("/api/expedition", {
        method: "POST",
        body: JSON.stringify({
          itemId,
          batchQty: parseInt(quantity),
          deliveryDate: batchDates[itemId] || new Date().toISOString().split("T")[0],
          plannedLoadingDate: loadingDates[itemId] || null,
          driverName: drivers[itemId] || null,
          note: notes[itemId] || null,
          planningId: linkedPlanningId ? Number(linkedPlanningId) : null,
        }),
      });
      setBatchQtys(current => ({ ...current, [itemId]: "" }));
      setDrivers(current => ({ ...current, [itemId]: "" }));
      setNotes(current => ({ ...current, [itemId]: "" }));
      setLoadingDates(current => ({ ...current, [itemId]: "" }));
      setSelectedPlans(current => ({ ...current, [itemId]: "" }));
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
      items: orderItems,
      totalOrdered,
      totalProduced,
      totalDelivered,
      visualState,
    };
  });

  const matchingIds = matchingItemIds === null ? null : new Set(matchingItemIds);
  const queryWords = normalizePlanningSearch(search).split(/\s+/).filter(Boolean);
  const selectedOrders = orders.map(order => ({ ...order, items: order.items.filter(item => {
    if (matchingIds && !matchingIds.has(item.itemId)) return false;
    const text = normalizePlanningSearch([order.orderNumber, order.clientName, order.affaire, item.articleName,
      ...plans.filter(plan => plan.itemId === item.itemId).map(plan => plan.driverName),
      ...batches.filter(batch => batch.itemId === item.itemId).map(batch => batch.driverName || ""),
    ].join(" "));
    return queryWords.every(word => text.includes(word));
  }) }));
  const visibleOrders = (loadError ? [] : selectedOrders).filter(order => order.items.length > 0);

  return (
    <div className="space-y-3 text-black operational-content">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-black">🚚 Expédition</h3>
        <button onClick={fetchData} className="px-3 py-1.5 bg-gray-200 border border-gray-400 rounded-lg text-sm text-black">🔄 Actualiser</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl p-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher commande, client, affaire, article ou chauffeur…" className="min-w-[220px] flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-black" />
        <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-black">
          <option value="all">Tous les états</option>
          {WORKFLOW_FILTERS.map(filter => <option key={filter.key} value={`workflow:${filter.key}`}>{filter.group} — {filter.label}</option>)}
        </select>
        <span className="text-xs text-gray-500">{visibleOrders.length} commande(s) · {visibleOrders.reduce((total, order) => total + order.items.length, 0)} article(s) affiché(s)</span>
      </div>

      <p className="text-xs text-gray-600">Le filtre affiche les articles concernés. Les totaux et l’état d’en-tête restent ceux de la commande complète ; les lignes de planning et leurs dates sont consultables dans le bilan global ci-dessous.</p>
      <PlanningOverview kind="expedition" />

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
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer text-black" onClick={() => toggle(order.orderId)}>
                <span className="font-bold text-black">{expanded.has(order.orderId) ? "▾" : "▸"}</span>
                <span className="font-semibold text-black">#{order.orderNumber}</span>
                <span className="text-sm text-black">{order.clientName}</span>
                {order.affaire && <span className="text-xs text-black">Aff: {order.affaire}</span>}
                <span className="px-2 py-1 rounded-md bg-white/70 border border-black/20 text-xs font-bold text-black">
                  {ORDER_STATE_LABELS[order.visualState]}
                </span>
                <div className="flex-1" />
                <span className="text-xs text-black">Cmd: <b>{order.totalOrdered}</b></span>
                <span className="text-xs text-black">Prod: <b>{order.totalProduced}</b></span>
                <span className="text-xs text-black">Livré: <b>{order.totalDelivered}</b></span>
                <div className="w-24 bg-white/60 border border-black/20 rounded-full h-2">
                  <div
                    className="bg-black rounded-full h-full"
                    style={{ width: `${Math.min(100, order.totalOrdered > 0 ? (order.totalDelivered / order.totalOrdered) * 100 : 0)}%` }}
                  />
                </div>
              </div>

              {expanded.has(order.orderId) && (
                <div className="border-t border-black/20 px-4 py-2 space-y-2 text-black">
                  {order.items.map(item => {
                    const remaining = Math.max(0, item.quantity - (item.deliveredQty || 0));
                    const availableToDeliver = Math.max(0, (item.producedQty || 0) - (item.deliveredQty || 0));
                    const delivered = remaining === 0;
                    const produced = (item.producedQty || 0) >= item.quantity;
                    const cancelled = order.visualState === "cancelled";
                    const itemState = cancelled ? "cancelled" : delivered ? "delivered" : produced ? "awaiting-delivery" : "neutral";
                    const itemPlans = plans.filter((plan) => plan.itemId === item.itemId && plan.status !== "ANNULE" && plan.status !== "LIVRE" && plan.status !== "TERMINE");
                    const defaultPlanId = selectedPlans[item.itemId] || (itemPlans.length === 1 ? String(itemPlans[0].id) : "");
                    return (
                      <div
                        key={item.itemId}
                        className={`flex items-center gap-2 text-xs py-2 px-2 flex-wrap rounded-lg border text-black ${ORDER_STATE_PANEL_CLASSES[itemState]}`}
                      >
                        <span className="w-28 truncate font-medium text-black">{item.articleName}</span>
                        <span className="text-black">Cmd: <b>{item.quantity}</b></span>
                        <span className="text-black">Prod: <b>{item.producedQty || 0}</b></span>
                        <span className="text-black">Livré: <b>{item.deliveredQty || 0}</b></span>
                        <span className="text-black font-bold">Reste: <b>{remaining}</b></span>
                        {canManage && !cancelled && itemPlans.length > 0 && <select value={defaultPlanId} onChange={(event) => setSelectedPlans(current => ({ ...current, [item.itemId]: event.target.value }))} className="max-w-48 px-1 py-1 border border-blue-400 rounded text-xs bg-white text-black" title="Planning d'expédition à imputer">
                          <option value="">Sans planning</option>
                          {itemPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.planDate} · {plan.driverName} · {plan.loadedQty}/{plan.plannedQty}</option>)}
                        </select>}

                        {canManage && !delivered && !cancelled && (
                          <>
                            <input type="number" min={1} max={availableToDeliver} placeholder="Qté" value={batchQtys[item.itemId] || ""} onChange={event => setBatchQtys(current => ({ ...current, [item.itemId]: event.target.value }))} className="w-14 px-1 py-1 border border-black/30 rounded text-sm bg-white text-black" />
                            <input type="date" value={batchDates[item.itemId] || new Date().toISOString().split("T")[0]} onChange={event => setBatchDates(current => ({ ...current, [item.itemId]: event.target.value }))} className="px-1 py-1 border border-black/30 rounded text-sm bg-white text-black w-28" />
                            <input type="text" placeholder="Chauffeur" value={drivers[item.itemId] || ""} onChange={event => setDrivers(current => ({ ...current, [item.itemId]: event.target.value }))} className="w-20 px-1 py-1 border border-black/30 rounded text-sm bg-white text-black" />
                            <input type="date" value={loadingDates[item.itemId] || ""} onChange={event => setLoadingDates(current => ({ ...current, [item.itemId]: event.target.value }))} className="px-1 py-1 border border-black/30 rounded text-sm bg-white text-black w-28" title="Chargement" />
                            <input type="text" placeholder="Note" value={notes[item.itemId] || ""} onChange={event => setNotes(current => ({ ...current, [item.itemId]: event.target.value }))} className="w-20 px-1 py-1 border border-black/30 rounded text-sm bg-white text-black" />
                            <button onClick={() => addBatch(item.itemId)} className="px-2 py-1 bg-gray-200 border border-black/40 text-black rounded text-xs font-semibold">+ Expédier</button>
                          </>
                        )}

                        {cancelled && <span className="font-bold text-black">Annulée</span>}
                        {!cancelled && delivered && <span className="font-bold text-black">Livrée</span>}
                        {!cancelled && !delivered && produced && <span className="font-bold text-black">En attente de livraison</span>}

                        {batches.filter(batch => batch.itemId === item.itemId).length > 0 && (
                          <div className="w-full flex gap-1 flex-wrap mt-1 text-black">
                            <span className="text-[9px] text-black">Historique :</span>
                            {batches.filter(batch => batch.itemId === item.itemId).map(batch => (
                              <span key={batch.id} className="text-[9px] bg-white/70 border border-black/20 px-1.5 py-0.5 rounded text-black" title={`${batch.deliveryDate} par ${batch.deliveredBy}`}>
                                {batch.deliveryDate}: {batch.quantity > 0 ? "+" : ""}{batch.quantity}{batch.quantity < 0 ? " (correction)" : ""}→{batch.cumulativeTotal}{batch.driverName ? ` • ${batch.driverName}` : ""}
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
