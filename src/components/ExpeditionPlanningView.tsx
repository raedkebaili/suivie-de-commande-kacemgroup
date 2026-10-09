"use client";

import { type ShortcutRequest } from "@/lib/keyboard-shortcuts";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { todayISO } from "@/lib/production-planning-constants";
import { priorityColorKey, priorityLabel, prioritySortRank } from "@/lib/priority";
import { useColors } from "@/lib/color-context";
import { getContrastTextColor } from "@/lib/color-utils";

type Plan = {
  id: number; planDate: string; itemId: number; orderId: number;
  articleName: string; orderNumber: string | null; clientName: string | null;
  plannedQty: number; loadedQty: number; driverName: string; status: string;
  note: string | null; itemQuantity: number | null; itemDeliveredQty: number | null;
  itemProducedQty: number | null; productionStatus: string | null;
  affaire: string | null; priority: string | null;
};

type ProdItem = {
  itemId: number; orderId: number; articleName: string; quantity: number;
  producedQty: number; deliveredQty: number; orderNumber: string;
  clientName: string | null; priority: string; productionStatus: string | null;
  affaire: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  NON_TRAITE: "Non traité", EN_COURS: "En cours de livraison",
  ANNULE: "Annulé", LIVRE: "Livré",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS);
const availableQty = (item: Pick<ProdItem, "producedQty" | "deliveredQty">) => Math.max(0, (item.producedQty || 0) - (item.deliveredQty || 0));

export default function ExpeditionPlanningView({ user, pendingAction, onPendingActionHandled }: { user: User; pendingAction?: ShortcutRequest | null; onPendingActionHandled?: () => void }) {
  const canManage = user.role === "superadmin" || user.role === "planification";
  const { getColor } = useColors();
  const [date, setDate] = useState(todayISO());
  const [driverFilter, setDriverFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [drivers, setDrivers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [prodItems, setProdItems] = useState<ProdItem[]>([]);
  const [selection, setSelection] = useState<Record<number, string>>({});
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
      setPlans(data.plans); setDrivers(data.drivers); setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally { setLoading(false); }
  }, [date, driverFilter, search]);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  const openPicker = async () => {
    setError(""); setShowPicker(true); setSelection({}); setPickerSearch(""); setDriverName(""); setNote("");
    try {
      const data = await apiFetch<{ items: ProdItem[] }>("/api/production");
      setProdItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement des articles produits");
    }
  };

  const filteredPicker = useMemo(() => {
    const q = pickerSearch.trim().toLocaleLowerCase("fr");
    return prodItems
      .filter((item) => item.productionStatus !== "ANNULEE" && availableQty(item) > 0)
      .filter((item) => !q || [item.articleName, item.orderNumber, item.clientName, item.affaire]
        .some((value) => String(value || "").toLocaleLowerCase("fr").includes(q)))
      .slice(0, 300);
  }, [prodItems, pickerSearch]);

  // Même structure que le sélecteur du planning production : une commande,
  // son client/affaire et sa priorité, puis ses articles disponibles.
  const pickerGroups = useMemo(() => {
    const map = new Map<number, { orderId: number; orderNumber: string; clientName: string | null; affaire: string | null; priority: string; items: ProdItem[] }>();
    for (const item of filteredPicker) {
      let group = map.get(item.orderId);
      if (!group) {
        group = { orderId: item.orderId, orderNumber: item.orderNumber, clientName: item.clientName, affaire: item.affaire, priority: item.priority, items: [] };
        map.set(item.orderId, group);
      }
      group.items.push(item);
    }
    return [...map.values()].sort((a, b) => {
      const byPriority = prioritySortRank(a.priority) - prioritySortRank(b.priority);
      return byPriority || a.orderNumber.localeCompare(b.orderNumber, "fr", { numeric: true });
    });
  }, [filteredPicker]);

  const toggleOrderSelection = (items: ProdItem[], checked: boolean) => {
    const next = { ...selection };
    for (const item of items) {
      if (checked) next[item.itemId] = String(availableQty(item));
      else delete next[item.itemId];
    }
    setSelection(next);
  };

  const createPlan = async () => {
    const selected = Object.entries(selection).filter(([, value]) => Number(value) > 0);
    if (selected.length === 0 || !driverName.trim()) {
      setError("Sélectionnez au moins un article disponible et indiquez un chauffeur/porteur");
      return;
    }
    setSaving(true); setError("");
    try {
      for (const [itemId, qty] of selected) {
        await apiFetch("/api/expedition-planning", {
          method: "POST",
          body: JSON.stringify({ planDate: date, itemId: Number(itemId), plannedQty: Number(qty), driverName: driverName.trim(), note: note.trim() || null }),
        });
      }
      setShowPicker(false); flash(`${selected.length} article(s) ajouté(s) au planning d'expédition`); await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de création");
    } finally { setSaving(false); }
  };

  const updatePlan = async (plan: Plan, patch: Record<string, unknown>) => {
    try { await apiFetch(`/api/expedition-planning/${plan.id}`, { method: "PUT", body: JSON.stringify(patch) }); await loadPlans(); }
    catch (err) { setError(err instanceof Error ? err.message : "Erreur de modification"); }
  };

  const deletePlan = async (plan: Plan) => {
    if (!window.confirm(`Retirer « ${plan.articleName} » du planning du ${plan.planDate} ?`)) return;
    try { await apiFetch(`/api/expedition-planning/${plan.id}`, { method: "DELETE" }); flash("Ligne retirée du planning"); await loadPlans(); }
    catch (err) { setError(err instanceof Error ? err.message : "Erreur de suppression"); }
  };

  const shiftDay = (delta: number) => {
    const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + delta); setDate(next.toISOString().slice(0, 10));
  };
  const stats = useMemo(() => ({ count: plans.length, quantity: plans.reduce((sum, plan) => sum + plan.plannedQty, 0), loaded: plans.reduce((sum, plan) => sum + plan.loadedQty, 0) }), [plans]);

  // Raccourci clavier demandé par la page — voir src/lib/keyboard-shortcuts.ts
  useEffect(() => {
    if (pendingAction?.action !== "plan-expedition") return;
    onPendingActionHandled?.();
    if (canManage) void openPicker();
    // Fonctions locales recréées à chaque rendu : seule la demande pilote l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);

  return (
    <div className="space-y-4 operational-content">
      <div className="flex flex-wrap items-center gap-2">
        <div><h3 className="text-lg font-semibold">🚚 Planning d&apos;expédition</h3><p className="text-xs text-gray-500">Les articles proposés proviennent uniquement de la production disponible.</p></div>
        <div className="flex-1" />
        <button onClick={() => shiftDay(-1)} className="px-2.5 py-1.5 bg-gray-200 rounded-lg text-sm">←</button>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm" />
        <button onClick={() => shiftDay(1)} className="px-2.5 py-1.5 bg-gray-200 rounded-lg text-sm">→</button>
        <button onClick={() => setDate(todayISO())} className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-sm">Aujourd&apos;hui</button>
        {canManage && <button onClick={openPicker} title="Planifier une expédition (Alt+X)" className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold">+ Planifier une expédition</button>}
        <button onClick={() => void loadPlans()} className="px-3 py-1.5 bg-gray-200 border border-gray-400 rounded-lg text-sm">🔄</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl p-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher article, commande, client, affaire…" className="min-w-[220px] flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm"><option value="all">Tous les chauffeurs / porteurs</option>{drivers.map((driver) => <option key={driver} value={driver}>{driver}</option>)}</select>
        <span className="text-xs text-gray-500">{stats.count} article(s) · {stats.loaded}/{stats.quantity} livré(s)</span>
      </div>
      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {notice && <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{notice}</div>}

      {loading ? <div className="flex justify-center py-12">Chargement...</div> : plans.length === 0 ? <div className="bg-white rounded-2xl border border-gray-200 py-12 text-center text-sm text-gray-500">Aucun article planifié pour ces critères.</div> : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs min-w-[1120px]"><thead><tr className="bg-gray-50 border-b text-left">
            <th className="px-3 py-2">Article</th><th className="px-3 py-2">Commande / détail</th><th className="px-3 py-2">Priorité</th><th className="px-3 py-2">Date de chargement</th><th className="px-3 py-2">Chauffeur / porteur</th><th className="px-3 py-2 text-right">Qté à livrer</th><th className="px-3 py-2 text-right">Livré</th><th className="px-3 py-2">État</th><th className="px-3 py-2">Note</th><th className="px-3 py-2">Actions</th>
          </tr></thead><tbody className="divide-y">
            {plans.map((plan) => {
              const isLocked = plan.loadedQty > 0 || plan.status === "LIVRE";
              const available = Math.max(0, (plan.itemProducedQty || 0) - (plan.itemDeliveredQty || 0));
              return <tr key={plan.id} className={`align-middle hover:bg-gray-50 ${plan.status === "ANNULE" ? "bg-red-100" : plan.status === "LIVRE" ? "bg-green-100" : ""}`}>
                <td className="px-3 py-2 font-semibold">{plan.articleName}</td>
                <td className="px-3 py-2"><span className="font-mono">#{plan.orderNumber || plan.orderId}</span><span className="block text-[10px] text-gray-500">{plan.clientName || "—"}{plan.affaire ? ` · ${plan.affaire}` : ""}</span></td>
                <td className="px-3 py-2">{plan.priority && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: getColor(priorityColorKey(plan.priority)), color: getContrastTextColor(getColor(priorityColorKey(plan.priority))) }}>{priorityLabel(plan.priority)}</span>}</td>
                <td className="px-3 py-2">{canManage && !isLocked ? <input type="date" defaultValue={plan.planDate} onBlur={(event) => { if (event.target.value !== plan.planDate) void updatePlan(plan, { planDate: event.target.value }); }} className="px-2 py-1 border rounded" /> : plan.planDate}</td>
                <td className="px-3 py-2">{canManage && !isLocked ? <input defaultValue={plan.driverName} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== plan.driverName) void updatePlan(plan, { driverName: value }); }} className="w-36 px-2 py-1 border rounded" /> : plan.driverName}</td>
                <td className="px-3 py-2 text-right font-bold">{canManage && !isLocked ? <input type="number" min={1} max={available} defaultValue={plan.plannedQty} onBlur={(event) => { const value = Number(event.target.value); if (value > 0 && value !== plan.plannedQty) void updatePlan(plan, { plannedQty: value }); }} className="w-20 px-2 py-1 border rounded text-right" /> : plan.plannedQty}</td>
                <td className="px-3 py-2 text-right">{plan.loadedQty}</td>
                <td className="px-3 py-2">{canManage && !isLocked ? <select value={plan.status} onChange={(event) => void updatePlan(plan, { status: event.target.value })} className="px-2 py-1 border rounded font-semibold">{STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select> : STATUS_LABELS[plan.status] || plan.status}</td>
                <td className="px-3 py-2 max-w-[200px]">{canManage && !isLocked ? <input defaultValue={plan.note || ""} onBlur={(event) => { const value = event.target.value.trim() || null; if (value !== plan.note) void updatePlan(plan, { note: value }); }} className="w-full px-2 py-1 border rounded" /> : plan.note || "—"}</td>
                <td className="px-3 py-2">{canManage && !isLocked && <button onClick={() => void deletePlan(plan)} className="px-2 py-1 bg-red-50 text-red-700 rounded">Retirer</button>}</td>
              </tr>;
            })}
          </tbody></table>
        </div>
      )}

      {showPicker && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPicker(false); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-3 justify-between mb-4"><div><h4 className="font-bold">Planifier une expédition — {date}</h4><p className="text-xs text-gray-500">Reste = produit − déjà livré. Les articles sans reliquat ne sont pas proposés.</p></div><input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Rechercher…" className="px-3 py-2 border rounded-lg text-sm" /></div>
          <div className="overflow-x-auto"><table className="w-full text-xs min-w-[820px]"><thead><tr className="bg-gray-50 text-left"><th className="px-2 py-2 w-8"></th><th className="px-2 py-2">Article</th><th className="px-2 py-2">Commande / détail</th><th className="px-2 py-2">Priorité</th><th className="px-2 py-2 text-right">Reste</th><th className="px-2 py-2 text-right">Qté à livrer</th></tr></thead><tbody className="divide-y">
            {pickerGroups.map((group) => { const color = getColor(priorityColorKey(group.priority)); const checked = group.items.every((item) => selection[item.itemId] !== undefined); return <Fragment key={group.orderId}>
              <tr key={`group-${group.orderId}`} className="bg-slate-100 border-t-2 border-slate-300"><td className="px-2 py-2"><input type="checkbox" checked={checked} onChange={(event) => toggleOrderSelection(group.items, event.target.checked)} /></td><td className="px-2 py-2 font-bold" colSpan={2}>Commande #{group.orderNumber}<span className="ml-2 font-normal text-gray-600">{group.clientName || "—"}</span>{group.affaire && <span className="ml-2 text-purple-700">Aff : {group.affaire}</span>}</td><td className="px-2 py-2"><span className="px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: color, color: getContrastTextColor(color) }}>{priorityLabel(group.priority)}</span></td><td className="px-2 py-2 text-right" colSpan={2}>{group.items.length} article(s)</td></tr>
              {group.items.map((item) => { const rest = availableQty(item); const selected = selection[item.itemId] !== undefined; return <tr key={item.itemId} className="hover:bg-gray-50"><td></td><td className="px-2 py-2 pl-6 font-medium"><input type="checkbox" checked={selected} onChange={(event) => { const next = { ...selection }; if (event.target.checked) next[item.itemId] = String(rest); else delete next[item.itemId]; setSelection(next); }} className="mr-2" />↳ {item.articleName}</td><td className="px-2 py-2 text-gray-500">produit {item.producedQty || 0} · livré {item.deliveredQty || 0}</td><td></td><td className="px-2 py-2 text-right font-bold text-orange-600">{rest}</td><td className="px-2 py-2 text-right"><input type="number" min={1} max={rest} disabled={!selected} value={selection[item.itemId] || ""} onChange={(event) => setSelection({ ...selection, [item.itemId]: event.target.value })} className="w-20 px-2 py-1 border rounded text-right disabled:opacity-40" /></td></tr>; })}
            </Fragment>; })}
            {pickerGroups.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-500">Aucun article produit disponible à livrer.</td></tr>}
          </tbody></table></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4"><input value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="Chauffeur / porteur" className="px-3 py-2 border rounded-lg text-sm" /><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note (optionnelle)" className="px-3 py-2 border rounded-lg text-sm" /></div>
          <div className="flex justify-end gap-2 mt-4"><button onClick={() => setShowPicker(false)} className="px-3 py-2 bg-gray-100 rounded-lg text-sm">Annuler</button><button disabled={saving} onClick={() => void createPlan()} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">{saving ? "Enregistrement…" : "Ajouter au planning"}</button></div>
        </div>
      </div>}
    </div>
  );
}
