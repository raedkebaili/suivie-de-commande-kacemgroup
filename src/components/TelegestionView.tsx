"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { useColors } from "@/lib/color-context";
import { getContrastTextColor } from "@/lib/color-utils";
import { priorityColorKey, priorityLabel } from "@/lib/priority";
import DocumentsPanel from "@/components/DocumentsPanel";

type TelComponent = {
  id: number; categoryName: string; materialReference: string; materialLabel: string;
  enteredByName: string; enteredAt: string;
};

type TelItem = {
  itemId: number; orderId: number; articleName: string; quantity: number;
  producedQty: number; deliveredQty: number; clientSpec: string | null; note: string | null;
  productionUnit: string | null; treated: boolean; telegestionComponents: TelComponent[];
};

type Group = {
  orderId: number; orderNumber: string; orderDate: string | null; affaire: string | null;
  clientName: string | null; agencyName: string | null; priority: string;
  status: string; productionStatus: string | null; items: TelItem[];
};

type Totals = { orders: number; items: number; treated: number; pending: number; quantity: number };

const PROD_LABELS: Record<string, string> = {
  EN_INSTANCE: "En instance", EN_PRODUCTION: "En production", LIVREE: "Livrée", ANNULEE: "Annulée",
};

/**
 * Onglet « 📡 Télégestion » — service technique.
 * Regroupe par commande tous les articles marqués « famille Télégestion »
 * par le commercial, prêts à être traités techniquement.
 * (Le traitement lui-même sera développé ultérieurement.)
 */
export default function TelegestionView({ user }: { user: User }) {
  const { getColor } = useColors();
  const isTech = user.role === "superadmin" || user.role === "technique";

  const [groups, setGroups] = useState<Group[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const telColor = getColor("TELEGESTION_ITEM");

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (debounced.trim().length >= 2) p.set("q", debounced.trim());
      if (statusFilter) p.set("status", statusFilter);
      if (pendingOnly) p.set("pending", "1");
      const d = await apiFetch<{ groups: Group[]; totals: Totals }>(`/api/telegestion?${p}`);
      setGroups(d.groups); setTotals(d.totals); setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally { setLoading(false); }
  }, [debounced, statusFilter, pendingOnly]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: number) => setCollapsed(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">📡 Télégestion</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Articles de la famille télégestion, regroupés par commande et prêts à être traités.
          </p>
        </div>
        {totals && (
          <div className="flex gap-2 flex-wrap text-[11px]">
            <span className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{totals.orders} commande(s)</span>
            <span className="px-2.5 py-1 rounded-full font-semibold border border-black/10" style={{ backgroundColor: telColor, color: getContrastTextColor(telColor) }}>{totals.items} article(s)</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">{totals.pending} à traiter</span>
            <span className="px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">{totals.treated} traité(s)</span>
            <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">Qté {totals.quantity}</span>
          </div>
        )}
      </div>

      {/* Filtres */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800 flex items-center gap-2 flex-wrap">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Article, commande, client, affaire…"
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-64 text-gray-700 dark:text-gray-200" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
          <option value="">Tous les états de production</option>
          {Object.entries(PROD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer flex items-center gap-1.5 border ${pendingOnly ? "bg-amber-100 border-amber-500 text-amber-800 font-semibold" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"}`}>
          <input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)} className="accent-amber-600" />
          À traiter uniquement
        </label>
        <div className="flex-1" />
        <button onClick={load} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-300">🔄 Actualiser</button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-sky-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
      ) : groups.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 py-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucun article de télégestion.</p>
          <p className="text-xs text-gray-400 mt-1">Le commercial coche « 📡 Télégestion » lors de la saisie d&apos;un article.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => {
            const isCollapsed = collapsed.has(g.orderId);
            const pbg = getColor(priorityColorKey(g.priority));
            const pending = g.items.filter(i => !i.treated).length;
            return (
              <div key={g.orderId} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button onClick={() => toggle(g.orderId)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 text-left hover:brightness-95 transition-all"
                  style={{ backgroundColor: telColor, color: getContrastTextColor(telColor) }}>
                  <span className="text-xs">{isCollapsed ? "▸" : "▾"}</span>
                  <span className="font-mono font-bold text-sm">#{g.orderNumber}</span>
                  <span className="text-sm font-semibold">{g.clientName || "—"}</span>
                  {g.affaire && <span className="text-xs opacity-80">Aff : {g.affaire}</span>}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: pbg, color: getContrastTextColor(pbg) }}>{priorityLabel(g.priority)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/70 text-black">{PROD_LABELS[g.productionStatus || ""] || g.productionStatus || "—"}</span>
                  <div className="flex-1" />
                  <span className="text-xs font-medium">{g.items.length} article(s){pending > 0 ? ` · ${pending} à traiter` : " · tous traités"}</span>
                </button>

                {!isCollapsed && (
                  <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 text-left">
                          <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Article</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Qté</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Produit</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Besoin client</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Usine</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Accessoires de télégestion</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Traitement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {g.items.map(i => (
                          <tr key={i.itemId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 align-top">
                            <td className="px-3 py-2 font-semibold text-gray-800 dark:text-gray-100">📡 {i.articleName}</td>
                            <td className="px-3 py-2 text-right font-bold text-blue-700 dark:text-blue-400">{i.quantity}</td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{i.producedQty || 0}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300 max-w-[200px]">{i.clientSpec || <span className="text-gray-400 italic">—</span>}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{i.productionUnit ? `🏭 ${i.productionUnit}` : <span className="text-gray-400 italic">—</span>}</td>
                            <td className="px-3 py-2">
                              {i.telegestionComponents.length === 0
                                ? <span className="text-gray-400 italic text-[11px]">Aucun composant saisi</span>
                                : i.telegestionComponents.map(c => (
                                    <div key={c.id} className="text-[11px] text-gray-700 dark:text-gray-300">
                                      <b>{c.materialReference}</b> — {c.materialLabel}
                                      <span className="text-[9px] text-gray-400 ml-1">({c.enteredByName})</span>
                                    </div>
                                  ))}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {i.treated
                                ? <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">✓ Traité</span>
                                : <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">À traiter</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Documents du projet — la commande contient des articles de la
                      famille Télégestion : ses documents (Stockage central) sont donc
                      accessibles ici (§ règle métier Télégestion). Association logique
                      uniquement : le fichier physique reste unique dans Google Drive. */}
                  <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-slate-50/60 dark:bg-gray-800/40">
                    <DocumentsPanel entity="order" entityId={g.orderId} user={user}
                      canAdd={isTech} title="Documents du projet"
                      defaultCategory="TELEGESTION" compact />
                  </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        💡 Les articles sont marqués « famille Télégestion » par le commercial à la saisie de la commande.
        {isTech && " Les accessoires de télégestion se renseignent depuis le détail de la commande (onglet Commandes)."}
        {" "}La couleur de surbrillance est personnalisable dans l&apos;onglet Couleurs (section « Technique / Télégestion »).
      </p>
    </div>
  );
}
