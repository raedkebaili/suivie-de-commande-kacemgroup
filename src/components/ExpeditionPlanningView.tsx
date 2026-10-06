"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { todayISO } from "@/lib/production-planning-constants";

type Plan = {
  id: number;
  planDate: string;
  itemId: number;
  orderId: number;
  articleName: string;
  orderNumber: string | null;
  clientName: string | null;
  plannedQty: number;
  loadedQty: number;
  driverName: string;
  status: string;
  note: string | null;
  itemQuantity: number | null;
  itemDeliveredQty: number | null;
  itemProducedQty: number | null;
  productionStatus: string | null;
  affaire: string | null;
};

type ExpeditionItem = {
  itemId: number;
  orderId: number;
  articleName: string;
  quantity: number;
  producedQty: number;
  deliveredQty: number;
  orderNumber: string;
  clientName: string | null;
  productionStatus: string | null;
  affaire: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  PLANIFIE: "Planifié",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  ANNULE: "Annulé",
};

export default function ExpeditionPlanningView({ user }: { user: User }) {
  const canManage = user.role === "superadmin" || user.role === "planification";
  const [date, setDate] = useState(todayISO());
  const [driverFilter, setDriverFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [drivers, setDrivers] = useState<string[]>([]);
  const [items, setItems] = useState<ExpeditionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  const [driverName, setDriverName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4500);
  };

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ date });
      if (driverFilter !== "all") query.set("driver", driverFilter);
      if (search.trim()) query.set("search", search.trim());
      const data = await apiFetch<{ plans: Plan[]; drivers: string[] }>(`/api/expedition-planning?${query}`);
      setPlans(data.plans);
      setDrivers(data.drivers);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [date, driverFilter, search]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const loadItems = async () => {
    try {
      const data = await apiFetch<{ items: ExpeditionItem[] }>("/api/expedition");
      setItems(data.items);
      setShowPicker(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement des articles");
    }
  };

  const selectedItem = items.find((item) => String(item.itemId) === selectedItemId);
  const availableItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return items
      .filter((item) => item.productionStatus !== "ANNULEE" && item.quantity - (item.deliveredQty || 0) > 0)
      .filter((item) => !q || [item.articleName, item.orderNumber, item.clientName, item.affaire]
        .some((value) => String(value || "").toLowerCase().includes(q)))
      .slice(0, 200);
  }, [items, pickerSearch]);

  const createPlan = async () => {
    if (!selectedItemId || !plannedQty || !driverName.trim()) {
      setError("Article, quantité et chauffeur/porteur sont requis");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/expedition-planning", {
        method: "POST",
        body: JSON.stringify({
          planDate: date,
          itemId: Number(selectedItemId),
          plannedQty: Number(plannedQty),
          driverName: driverName.trim(),
          note: note.trim() || null,
        }),
      });
      setShowPicker(false);
      setSelectedItemId("");
      setPlannedQty("");
      setDriverName("");
      setNote("");
      flash("Article ajouté au planning d'expédition");
      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de création");
    } finally {
      setSaving(false);
    }
  };

  const updatePlan = async (plan: Plan, patch: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/expedition-planning/${plan.id}`, { method: "PUT", body: JSON.stringify(patch) });
      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de modification");
    }
  };

  const deletePlan = async (plan: Plan) => {
    if (!window.confirm(`Supprimer le planning de « ${plan.articleName} » pour ${plan.driverName} ?`)) return;
    try {
      await apiFetch(`/api/expedition-planning/${plan.id}`, { method: "DELETE" });
      flash("Planning supprimé");
      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de suppression");
    }
  };

  const shiftDay = (delta: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  const stats = useMemo(() => ({
    count: plans.length,
    quantity: plans.reduce((sum, plan) => sum + plan.plannedQty, 0),
    loaded: plans.reduce((sum, plan) => sum + plan.loadedQty, 0),
  }), [plans]);

  return (
    <div className="space-y-4 operational-content">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold mr-2">🚚 Planning d&apos;expédition</h3>
        <button onClick={() => shiftDay(-1)} className="px-2.5 py-1.5 bg-gray-200 rounded-lg text-sm">←</button>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm" />
        <button onClick={() => shiftDay(1)} className="px-2.5 py-1.5 bg-gray-200 rounded-lg text-sm">→</button>
        <button onClick={() => setDate(todayISO())} className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-sm">Aujourd&apos;hui</button>
        <div className="flex-1" />
        {canManage && <button onClick={loadItems} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold">+ Planifier une expédition</button>}
        <button onClick={loadPlans} className="px-3 py-1.5 bg-gray-200 border border-gray-400 rounded-lg text-sm">🔄</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl p-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher article, commande, client, affaire…" className="min-w-[220px] flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="all">Tous les chauffeurs / porteurs</option>
          {drivers.map((driver) => <option key={driver} value={driver}>{driver}</option>)}
        </select>
        <span className="text-xs text-gray-500">{stats.count} article(s) · {stats.loaded}/{stats.quantity} planifié(s) chargé(s)</span>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {notice && <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{notice}</div>}

      {loading ? <div className="flex justify-center py-12">Chargement...</div> : plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 py-12 text-center text-sm text-gray-500">Aucun article planifié pour ces critères.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs min-w-[980px]">
            <thead><tr className="bg-gray-50 border-b text-left">
              <th className="px-3 py-2">Article</th><th className="px-3 py-2">Commande</th><th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Chauffeur / porteur</th><th className="px-3 py-2 text-right">Qté</th><th className="px-3 py-2 text-right">Expédié</th><th className="px-3 py-2">État</th><th className="px-3 py-2">Note</th><th className="px-3 py-2">Actions</th>
            </tr></thead>
            <tbody className="divide-y">
              {plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50 align-middle">
                  <td className="px-3 py-2 font-semibold">{plan.articleName}</td>
                  <td className="px-3 py-2 font-mono">#{plan.orderNumber || plan.orderId}</td>
                  <td className="px-3 py-2">{plan.clientName || "—"}</td>
                  <td className="px-3 py-2">
                    {canManage && plan.loadedQty === 0 ? <input defaultValue={plan.driverName} onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== plan.driverName) updatePlan(plan, { driverName: event.target.value.trim() }); }} className="w-40 px-2 py-1 border rounded" /> : plan.driverName}
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{plan.plannedQty}</td>
                  <td className="px-3 py-2 text-right">{plan.loadedQty}</td>
                  <td className="px-3 py-2">
                    {canManage ? <select value={plan.status} onChange={(event) => updatePlan(plan, { status: event.target.value })} className="px-2 py-1 border rounded font-semibold">
                      {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select> : STATUS_LABELS[plan.status] || plan.status}
                  </td>
                  <td className="px-3 py-2 max-w-[180px]">{canManage ? <input defaultValue={plan.note || ""} onBlur={(event) => { const value = event.target.value.trim() || null; if (value !== plan.note) updatePlan(plan, { note: value }); }} className="w-full px-2 py-1 border rounded" /> : plan.note || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{canManage && plan.loadedQty === 0 && <button onClick={() => deletePlan(plan)} className="px-2 py-1 bg-red-50 text-red-700 rounded">Supprimer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPicker(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4"><h4 className="font-bold">Planifier une expédition le {date}</h4><button onClick={() => setShowPicker(false)} className="text-gray-500 text-xl">×</button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Rechercher un article ou une commande…" className="px-3 py-2 border rounded-lg text-sm" />
              <select value={selectedItemId} onChange={(event) => { setSelectedItemId(event.target.value); const item = items.find((candidate) => String(candidate.itemId) === event.target.value); setPlannedQty(item ? String(Math.max(0, item.quantity - item.deliveredQty)) : ""); }} className="px-3 py-2 border rounded-lg text-sm">
                <option value="">Sélectionner un article</option>
                {availableItems.map((item) => <option key={item.itemId} value={item.itemId}>#{item.orderNumber} · {item.articleName} · reste {item.quantity - item.deliveredQty}</option>)}
              </select>
              <input type="number" min={1} max={selectedItem ? selectedItem.quantity - selectedItem.deliveredQty : undefined} value={plannedQty} onChange={(event) => setPlannedQty(event.target.value)} placeholder="Quantité" className="px-3 py-2 border rounded-lg text-sm" />
              <input value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="Chauffeur / porteur" className="px-3 py-2 border rounded-lg text-sm" />
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note (optionnelle)" className="px-3 py-2 border rounded-lg text-sm md:col-span-2" />
            </div>
            <div className="flex justify-end gap-2"><button onClick={() => setShowPicker(false)} className="px-3 py-2 bg-gray-100 rounded-lg text-sm">Annuler</button><button disabled={saving} onClick={createPlan} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">{saving ? "Enregistrement…" : "Ajouter au planning"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
