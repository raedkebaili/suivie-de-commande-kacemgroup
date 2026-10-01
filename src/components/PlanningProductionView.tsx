"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { useColors } from "@/lib/color-context";
import { getContrastTextColor } from "@/lib/color-utils";
import {
  PLANNING_STATUSES,
  PLANNING_STATUS_BY_KEY,
  planningEntryBlinks,
  planningStatusLabel,
  todayISO,
} from "@/lib/production-planning-constants";
import { priorityColorKey, priorityLabel, prioritySortRank } from "@/lib/priority";

type Entry = {
  id: number; planDate: string; itemId: number; orderId: number;
  articleName: string; orderNumber: string | null; clientName: string | null;
  plannedQty: number; status: string; reason: string | null;
  appliedQty: number; appliedAt: string | null;
  createdByName: string | null; updatedByName: string | null; updatedAt: string | null;
  itemQuantity: number | null; itemProducedQty: number | null; itemDeliveredQty: number | null;
  productionStatus: string | null;
};

type ProdItem = {
  itemId: number; orderId: number; articleName: string; quantity: number;
  producedQty: number; deliveredQty: number; orderNumber: string;
  clientName: string | null; priority: string; productionStatus: string | null; affaire: string | null;
};

/**
 * Onglet « Planning production » — réservé au responsable planification.
 * Permet de composer un planning journalier à partir des articles de
 * l'onglet Production, d'en suivre l'état en temps réel et d'appliquer
 * automatiquement la quantité produite lorsque la ligne passe à « Terminé ».
 */
export default function PlanningProductionView({ user }: { user: User }) {
  const canManage = user.role === "superadmin" || user.role === "planification";
  const { getColor } = useColors();

  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Sélection d'articles (issus de l'onglet Production)
  const [showPicker, setShowPicker] = useState(false);
  const [prodItems, setProdItems] = useState<ProdItem[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selection, setSelection] = useState<Record<number, string>>({}); // itemId → quantité
  const [saving, setSaving] = useState(false);

  // Saisie du motif (Raison)
  const [reasonEditor, setReasonEditor] = useState<{ entry: Entry; nextStatus: string; value: string } | null>(null);

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(""), 5000); };

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ entries: Entry[] }>(`/api/production-planning?date=${date}`);
      setEntries(d.entries);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Temps réel : rafraîchissement automatique toutes les 30 s
  useEffect(() => {
    const iv = setInterval(() => { load(); }, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const openPicker = async () => {
    setShowPicker(true); setSelection({}); setPickerSearch("");
    try {
      const d = await apiFetch<{ items: ProdItem[] }>("/api/production");
      setProdItems(d.items);
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  const addSelection = async () => {
    const list = Object.entries(selection)
      .map(([itemId, q]) => ({ itemId: parseInt(itemId), plannedQty: parseInt(q) || 0 }))
      .filter(e => e.plannedQty > 0);
    if (list.length === 0) { setError("Sélectionnez au moins un article avec une quantité"); return; }
    setSaving(true); setError("");
    try {
      const r = await apiFetch<{ created: unknown[]; skipped: { itemId: number; reason: string }[] }>("/api/production-planning", {
        method: "POST", body: JSON.stringify({ date, entries: list }),
      });
      setShowPicker(false);
      flash(`${r.created.length} article(s) ajouté(s) au planning du ${date}` +
        (r.skipped.length > 0 ? ` — ${r.skipped.length} ignoré(s) : ${r.skipped.map(s => s.reason).join(", ")}` : ""));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    finally { setSaving(false); }
  };

  /** Changement de statut ; ouvre la saisie du motif si requis */
  const changeStatus = async (entry: Entry, nextStatus: string) => {
    const def = PLANNING_STATUS_BY_KEY[nextStatus];
    if (def?.requiresReason && !(entry.reason || "").trim()) {
      setReasonEditor({ entry, nextStatus, value: entry.reason || "" });
      return;
    }
    await applyStatus(entry, nextStatus, entry.reason || undefined);
  };

  const applyStatus = async (entry: Entry, nextStatus: string, reason?: string) => {
    setError("");
    try {
      const payload: Record<string, unknown> = { status: nextStatus };
      if (reason !== undefined) payload.reason = reason;
      const r = await apiFetch<{ applied: { actualQty: number; cumulative: number; priorityPromotion: { promoted: { orderNumber: string; from: string; to: string }[] } | null } | null }>(
        `/api/production-planning/${entry.id}`, { method: "PUT", body: JSON.stringify(payload) });
      if (r.applied) {
        let msg = `Production enregistrée : +${r.applied.actualQty} ${entry.articleName} (cumul ${r.applied.cumulative})`;
        const promo = r.applied.priorityPromotion?.promoted || [];
        if (promo.length > 0) msg += ` — ${promo.length} commande(s) promue(s) : ${promo.map(p => `#${p.orderNumber} ${p.from}→${p.to}`).join(", ")}`;
        flash(msg);
      }
      setReasonEditor(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  const saveReason = async (entry: Entry, value: string) => {
    setError("");
    try {
      await apiFetch(`/api/production-planning/${entry.id}`, { method: "PUT", body: JSON.stringify({ reason: value }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  const removeEntry = async (entry: Entry) => {
    if (!confirm(`Retirer « ${entry.articleName} » du planning du ${entry.planDate} ?`)) return;
    try {
      await apiFetch(`/api/production-planning/${entry.id}`, { method: "DELETE" });
      flash("Ligne retirée du planning");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  /** Style d'une cellule d'état : couleur administrable + clignotement si en cours */
  const statusStyle = (status: string, planDate?: string): React.CSSProperties => {
    const def = PLANNING_STATUS_BY_KEY[status];
    const bg = getColor(def?.colorKey || "PLANNING_EN_ATTENTE");
    if (planningEntryBlinks(status, planDate)) {
      return { ["--planning-color"]: bg, ["--planning-text"]: getContrastTextColor(bg) } as React.CSSProperties;
    }
    return { backgroundColor: bg, color: getContrastTextColor(bg) };
  };

  const filteredPicker = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const base = prodItems.filter(i => i.productionStatus !== "ANNULEE" && (i.quantity - (i.producedQty || 0)) > 0);
    if (q.length < 2) return base.slice(0, 200);
    return base.filter(i =>
      i.articleName.toLowerCase().includes(q) ||
      (i.orderNumber || "").toLowerCase().includes(q) ||
      (i.clientName || "").toLowerCase().includes(q)).slice(0, 200);
  }, [prodItems, pickerSearch]);

  /**
   * Articles du sélecteur REGROUPÉS PAR COMMANDE : l'utilisateur visualise
   * immédiatement à quelle commande (et quel client) appartient chaque article.
   * Les commandes les plus prioritaires apparaissent en premier.
   */
  const pickerGroups = useMemo(() => {
    const map = new Map<number, { orderId: number; orderNumber: string; clientName: string | null; affaire: string | null; priority: string; items: ProdItem[] }>();
    for (const i of filteredPicker) {
      let g = map.get(i.orderId);
      if (!g) {
        g = { orderId: i.orderId, orderNumber: i.orderNumber, clientName: i.clientName, affaire: i.affaire, priority: i.priority, items: [] };
        map.set(i.orderId, g);
      }
      g.items.push(i);
    }
    return [...map.values()].sort((a, b) => {
      const d = prioritySortRank(a.priority) - prioritySortRank(b.priority);
      return d !== 0 ? d : (a.orderNumber || "").localeCompare(b.orderNumber || "", "fr");
    });
  }, [filteredPicker]);

  /** Coche / décoche tous les articles d'une commande */
  const toggleOrderSelection = (items: ProdItem[], checked: boolean) => {
    const next = { ...selection };
    for (const i of items) {
      if (checked) next[i.itemId] = String(i.quantity - (i.producedQty || 0));
      else delete next[i.itemId];
    }
    setSelection(next);
  };

  const stats = useMemo(() => {
    const by: Record<string, number> = {};
    for (const e of entries) by[e.status] = (by[e.status] || 0) + 1;
    return by;
  }, [entries]);

  const shiftDay = (delta: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">🗓️ Planning production</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Suivi journalier en temps réel des articles en cours de production.
          </p>
        </div>
        {canManage && (
          <button onClick={openPicker} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            + Planifier des articles
          </button>
        )}
      </div>

      {/* Barre de date + compteurs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800 flex items-center gap-2 flex-wrap">
        <button onClick={() => shiftDay(-1)} className="px-2.5 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">←</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
        <button onClick={() => shiftDay(1)} className="px-2.5 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">→</button>
        <button onClick={() => setDate(todayISO())} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">Aujourd&apos;hui</button>
        <div className="flex-1" />
        {PLANNING_STATUSES.map(s => {
          const bg = getColor(s.colorKey);
          return (
            <span key={s.key} className="text-[11px] px-2 py-0.5 rounded-full border border-black/10 font-medium"
              style={{ backgroundColor: bg, color: getContrastTextColor(bg) }}>
              {s.label} : {stats[s.key] || 0}
            </span>
          );
        })}
        <button onClick={load} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200">🔄</button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {notice && <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">{notice}</div>}

      {/* Tableau du planning */}
      {loading ? (
        <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
      ) : entries.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 py-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucun article planifié pour le {date}.</p>
          {canManage && <p className="text-xs text-gray-400 mt-1">Utilisez « + Planifier des articles » pour composer la journée.</p>}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Article</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Commande</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Client</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Qté planifiée</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Avancement</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">État de production</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Raison</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map(e => {
                  // Clignote seulement si EN_COURS ET date atteinte (pas de prévision)
                  const blinking = planningEntryBlinks(e.status, e.planDate);
                  const isFuture = e.planDate > todayISO();
                  const def = PLANNING_STATUS_BY_KEY[e.status];
                  const requiresReason = def?.requiresReason;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 align-middle">
                      <td className="px-3 py-2">
                        <span className={blinking ? "planning-blink inline-block px-1.5 py-0.5 font-semibold" : "font-semibold text-gray-800 dark:text-gray-100"}
                          style={blinking ? statusStyle(e.status, e.planDate) : undefined}>
                          {e.articleName}
                        </span>
                        {isFuture && e.status === "EN_COURS" && (
                          <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 font-medium"
                            title={`Production prévue le ${e.planDate} : l'alerte visuelle démarrera à cette date`}>
                            prévision
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-600 dark:text-gray-300">#{e.orderNumber || e.orderId}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{e.clientName || "-"}</td>
                      <td className="px-3 py-2 text-right font-bold text-blue-700 dark:text-blue-400">{e.plannedQty}</td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {e.itemProducedQty ?? 0}/{e.itemQuantity ?? 0}
                        {e.appliedAt && <span className="block text-[9px] text-green-600 dark:text-green-400">+{e.appliedQty} appliqué</span>}
                      </td>
                      <td className="px-3 py-2">
                        {canManage ? (
                          <select value={e.status} onChange={ev => changeStatus(e, ev.target.value)}
                            className={`text-[11px] font-bold px-2 py-1 rounded border border-black/20 ${blinking ? "planning-blink" : ""}`}
                            style={statusStyle(e.status, e.planDate)}>
                            {PLANNING_STATUSES.map(s => <option key={s.key} value={s.key} style={{ backgroundColor: "#fff", color: "#000" }}>{s.label}</option>)}
                          </select>
                        ) : (
                          <span className={`text-[11px] font-bold px-2 py-1 rounded inline-block ${blinking ? "planning-blink" : ""}`} style={statusStyle(e.status, e.planDate)}>
                            {planningStatusLabel(e.status)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[220px]">
                        {canManage ? (
                          <input type="text" defaultValue={e.reason || ""} placeholder={requiresReason ? "Motif requis…" : "Motif (optionnel)"}
                            onBlur={ev => { if (ev.target.value !== (e.reason || "")) saveReason(e, ev.target.value); }}
                            className={`w-full px-2 py-1 text-[11px] bg-white dark:bg-gray-800 border rounded text-gray-700 dark:text-gray-200 ${requiresReason && !e.reason ? "border-red-400" : "border-gray-300 dark:border-gray-600"}`} />
                        ) : (
                          <span className="text-[11px] text-gray-600 dark:text-gray-300">{e.reason || "-"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {canManage && !e.appliedAt && (
                          <button onClick={() => removeEntry(e)} className="px-2 py-1 text-[10px] bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-100">Retirer</button>
                        )}
                        {e.appliedAt && <span className="text-[10px] text-gray-400" title={`Production appliquée le ${e.appliedAt}`}>🔒 appliqué</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        💡 Passer une ligne à <b>Terminé</b> enregistre la quantité en production : l&apos;onglet Production et le tableau
        des commandes sont mis à jour automatiquement. Les articles <b>en cours</b> clignotent ici et dans le tableau des commandes.
        Les couleurs sont personnalisables dans l&apos;onglet Couleurs (section « Planning de Production »).
      </p>

      {/* Sélecteur d'articles */}
      {showPicker && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPicker(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[88vh] flex flex-col">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white">Planifier des articles — {date}</h4>
                <p className="text-[11px] text-gray-500">Articles issus de l&apos;onglet Production, restant à produire.</p>
              </div>
              <input type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="🔍 Rechercher…"
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-56 text-gray-700 dark:text-gray-200" />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-2 py-2 font-semibold text-gray-600 dark:text-gray-300">Article</th>
                    <th className="px-2 py-2 font-semibold text-gray-600 dark:text-gray-300" colSpan={2}>Commande / détail</th>
                    <th className="px-2 py-2 font-semibold text-gray-600 dark:text-gray-300">Priorité</th>
                    <th className="px-2 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Reste</th>
                    <th className="px-2 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Qté à produire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {/* Articles REGROUPÉS PAR COMMANDE : en-tête de commande puis ses articles */}
                  {pickerGroups.map(g => {
                    const pbg = getColor(priorityColorKey(g.priority));
                    const allChecked = g.items.every(i => selection[i.itemId] !== undefined);
                    return (
                      <React.Fragment key={g.orderId}>
                        <tr className="bg-slate-100 dark:bg-gray-800 border-t-2 border-slate-300 dark:border-gray-600">
                          <td className="px-2 py-1.5">
                            <input type="checkbox" checked={allChecked} className="accent-blue-600"
                              title="Sélectionner tous les articles de cette commande"
                              onChange={ev => toggleOrderSelection(g.items, ev.target.checked)} />
                          </td>
                          <td className="px-2 py-1.5 font-bold text-gray-800 dark:text-gray-100" colSpan={3}>
                            Commande #{g.orderNumber}
                            <span className="ml-2 font-normal text-gray-600 dark:text-gray-300">{g.clientName || "—"}</span>
                            {g.affaire && <span className="ml-2 text-[10px] text-purple-600 dark:text-purple-400">Aff : {g.affaire}</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: pbg, color: getContrastTextColor(pbg) }}>{priorityLabel(g.priority)}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right text-[10px] text-gray-500" colSpan={2}>
                            {g.items.length} article(s) à produire
                          </td>
                        </tr>
                        {g.items.map(i => {
                          const rest = i.quantity - (i.producedQty || 0);
                          const checked = selection[i.itemId] !== undefined;
                          return (
                            <tr key={i.itemId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-2 py-1.5"></td>
                              <td className="px-2 py-1.5 font-medium text-gray-800 dark:text-gray-100 pl-6">
                                <input type="checkbox" checked={checked} className="accent-blue-600 mr-2"
                                  onChange={ev => {
                                    const next = { ...selection };
                                    if (ev.target.checked) next[i.itemId] = String(rest); else delete next[i.itemId];
                                    setSelection(next);
                                  }} />
                                ↳ {i.articleName}
                              </td>
                              <td className="px-2 py-1.5 text-[10px] text-gray-400" colSpan={2}>
                                commandé {i.quantity} · produit {i.producedQty || 0}
                              </td>
                              <td className="px-2 py-1.5"></td>
                              <td className="px-2 py-1.5 text-right font-bold text-orange-600 dark:text-orange-400">{rest}</td>
                              <td className="px-2 py-1.5 text-right">
                                <input type="number" min={1} max={rest} disabled={!checked}
                                  value={selection[i.itemId] ?? ""} onChange={ev => setSelection({ ...selection, [i.itemId]: ev.target.value })}
                                  className="w-20 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-right text-gray-700 dark:text-gray-200 disabled:opacity-40" />
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                  {pickerGroups.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucun article à produire</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <span className="text-xs text-gray-500">{Object.keys(selection).length} article(s) sélectionné(s)</span>
              <div className="flex gap-2">
                <button onClick={() => setShowPicker(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Annuler</button>
                <button onClick={addSelection} disabled={saving} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Ajout…" : "Ajouter au planning"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saisie du motif obligatoire */}
      {reasonEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setReasonEditor(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-5">
            <h4 className="font-semibold text-gray-800 dark:text-white mb-1">
              Motif — {planningStatusLabel(reasonEditor.nextStatus)}
            </h4>
            <p className="text-[11px] text-gray-500 mb-3">
              Article « {reasonEditor.entry.articleName} ». Indiquez pourquoi la production est {reasonEditor.nextStatus === "ANNULE" ? "annulée" : "suspendue"}.
            </p>
            <textarea autoFocus rows={3} value={reasonEditor.value}
              onChange={e => setReasonEditor({ ...reasonEditor, value: e.target.value })}
              placeholder="Ex : rupture de matière première, panne machine…"
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setReasonEditor(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Annuler</button>
              <button onClick={() => applyStatus(reasonEditor.entry, reasonEditor.nextStatus, reasonEditor.value)}
                disabled={!reasonEditor.value.trim()}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
