"use client";
import { useEffect, useState, useCallback } from "react";
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

export default function ExpeditionView({ user: _user }: { user: User }) {
  const [items, setItems] = useState<Item[]>([]);
  const [batches, setBatches] = useState<ExpeditionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchQtys, setBatchQtys] = useState<Record<number, string>>({});
  const [batchDates, setBatchDates] = useState<Record<number, string>>({});
  const [drivers, setDrivers] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loadingDates, setLoadingDates] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    const data = await apiFetch<{ items: Item[]; batches: ExpeditionBatch[] }>("/api/expedition");
    setItems(data.items);
    setBatches(data.batches || []);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const toggle = (orderId: number) => {
    const next = new Set(expanded);
    next.has(orderId) ? next.delete(orderId) : next.add(orderId);
    setExpanded(next);
  };

  const addBatch = async (itemId: number) => {
    const quantity = batchQtys[itemId];
    if (!quantity || parseInt(quantity) <= 0) return;
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
        }),
      });
      setBatchQtys(current => ({ ...current, [itemId]: "" }));
      setDrivers(current => ({ ...current, [itemId]: "" }));
      setNotes(current => ({ ...current, [itemId]: "" }));
      setLoadingDates(current => ({ ...current, [itemId]: "" }));
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

  return (
    <div className="space-y-3 text-black operational-content">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-black">🚚 Expédition</h3>
        <button onClick={fetchData} className="px-3 py-1.5 bg-gray-200 border border-gray-400 rounded-lg text-sm text-black">🔄 Actualiser</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-black">Chargement...</div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => (
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
                    const delivered = remaining === 0;
                    const produced = (item.producedQty || 0) >= item.quantity;
                    const cancelled = order.visualState === "cancelled";
                    const itemState = cancelled ? "cancelled" : delivered ? "delivered" : produced ? "awaiting-delivery" : "neutral";
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

                        {!delivered && !cancelled && (
                          <>
                            <input type="number" min={1} max={remaining} placeholder="Qté" value={batchQtys[item.itemId] || ""} onChange={event => setBatchQtys(current => ({ ...current, [item.itemId]: event.target.value }))} className="w-14 px-1 py-1 border border-black/30 rounded text-sm bg-white text-black" />
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
                                {batch.deliveryDate}: +{batch.quantity}→{batch.cumulativeTotal}{batch.driverName ? ` • ${batch.driverName}` : ""}
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
