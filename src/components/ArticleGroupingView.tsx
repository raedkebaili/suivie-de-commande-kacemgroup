"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getToken } from "@/lib/api";
import type { ArticleGroup } from "@/lib/article-grouping";

type Totals = { groups: number; lines: number; quantity: number; produced: number; delivered: number; remaining: number };

/**
 * Tableau de regroupement des articles par préfixe de 3 caractères.
 * Affiché sous les études photométriques dans l'onglet Commandes.
 *
 * « Toujours à jour » : rechargé à chaque changement de filtre et à chaque
 * rafraîchissement du tableau des commandes (prop refreshKey), donc les
 * nouvelles commandes apparaissent automatiquement.
 */
export default function ArticleGroupingView({
  filters,
  refreshKey,
}: {
  filters: { status: string; agency: string; priority: string };
  refreshKey: number;
}) {
  const [groups, setGroups] = useState<ArticleGroup[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.status) p.set("status", filters.status);
    if (filters.agency) p.set("agencyId", filters.agency);
    if (filters.priority) p.set("priority", filters.priority);
    return p.toString();
  }, [filters.status, filters.agency, filters.priority]);

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await apiFetch<{ groups: ArticleGroup[]; totals: Totals }>(`/api/orders/grouped-articles?${query}`);
      setGroups(data.groups);
      setTotals(data.totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Export Excel : passe par le token (téléchargement authentifié)
  const exportXlsx = async () => {
    try {
      const res = await fetch(`/api/orders/grouped-articles?${query}${query ? "&" : ""}format=xlsx`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `regroupement-articles-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur d'export");
    }
  };

  const visibleGroups = useMemo(() => {
    if (search.trim().length < 2) return groups;
    const q = search.toLowerCase();
    return groups
      .map(g => ({ ...g, lines: g.lines.filter(l =>
        (l.articleName || "").toLowerCase().includes(q) ||
        (l.affaire || "").toLowerCase().includes(q) ||
        (l.clientName || "").toLowerCase().includes(q) ||
        (l.orderNumber || "").toLowerCase().includes(q)) }))
      .filter(g => g.lines.length > 0 || g.key.toLowerCase().includes(q));
  }, [groups, search]);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button onClick={() => setOpen(o => !o)} className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover:text-blue-600">
          <span>{open ? "▾" : "▸"}</span> 📊 Regroupement par Article
        </button>
        {totals && <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{totals.groups} groupe(s) · {totals.lines} ligne(s)</span>}
        <span className="text-[11px] text-gray-400 italic">Regroupement sur les 3 premiers caractères du nom d&apos;article</span>
        <div className="flex-1" />
        {open && <>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filtrer article, affaire, client..."
            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-56 text-gray-700 dark:text-gray-200" />
          <button onClick={load} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-300">🔄 Actualiser</button>
          <button onClick={exportXlsx} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">📤 Exporter</button>
        </>}
      </div>

      {open && (
        error ? (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-8"><svg className="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
        ) : visibleGroups.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 py-8 text-center text-sm text-gray-400">Aucun article à regrouper</div>
        ) : (
          <div className="space-y-3">
            {visibleGroups.map(g => {
              const isCollapsed = collapsed.has(g.key);
              return (
                <div key={g.key} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* En-tête du groupe */}
                  <button onClick={() => toggleGroup(g.key)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 bg-slate-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors">
                    <span className="text-gray-500 dark:text-gray-400 text-xs">{isCollapsed ? "▸" : "▾"}</span>
                    <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-blue-600 text-white">{g.key}</span>
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{g.variants.join(" · ")}</span>
                    <div className="flex-1" />
                    <span className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      <b className="text-blue-700 dark:text-blue-400">{g.totalQuantity}</b> cmd · <b>{g.totalProduced}</b> prod · <b>{g.totalDelivered}</b> livré · <b className="text-orange-600 dark:text-orange-400">{g.totalRemaining}</b> reste
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 text-left">
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Article</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Quantité</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Affaire</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Client</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">N° Cmd</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Produit</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Livré</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Reste</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {g.lines.map((l, i) => {
                            // Séparateur visuel quand l'article change dans le groupe
                            const newArticle = i === 0 || l.articleName !== g.lines[i - 1].articleName;
                            return (
                              <tr key={`${g.key}-${i}`} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${newArticle && i > 0 ? "border-t-2 border-t-gray-300 dark:border-t-gray-600" : ""}`}>
                                <td className={`px-3 py-1.5 ${newArticle ? "font-semibold text-gray-800 dark:text-gray-100" : "text-gray-400 dark:text-gray-500 pl-6"}`}>
                                  {newArticle ? l.articleName : "↳"}
                                </td>
                                <td className="px-3 py-1.5 text-right font-bold text-blue-700 dark:text-blue-400">{l.quantity}</td>
                                <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{l.affaire || <span className="text-gray-400 italic">—</span>}</td>
                                <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{l.clientName || "-"}</td>
                                <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 font-mono text-[10px]">{l.orderNumber || "-"}</td>
                                <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{l.producedQty}</td>
                                <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{l.deliveredQty}</td>
                                <td className="px-3 py-1.5 text-right font-medium text-orange-600 dark:text-orange-400">{l.remaining}</td>
                              </tr>
                            );
                          })}
                          <tr className="bg-slate-50 dark:bg-gray-800 font-bold border-t-2 border-gray-300 dark:border-gray-600">
                            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">TOTAL {g.key}</td>
                            <td className="px-3 py-1.5 text-right text-blue-700 dark:text-blue-400">{g.totalQuantity}</td>
                            <td className="px-3 py-1.5" colSpan={3}></td>
                            <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-200">{g.totalProduced}</td>
                            <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-200">{g.totalDelivered}</td>
                            <td className="px-3 py-1.5 text-right text-orange-600 dark:text-orange-400">{g.totalRemaining}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Total général */}
            {totals && (
              <div className="bg-slate-800 dark:bg-gray-950 text-white rounded-2xl px-4 py-3 flex items-center gap-4 flex-wrap text-sm">
                <span className="font-bold">TOTAL GÉNÉRAL</span>
                <span className="text-slate-300">{totals.groups} groupes · {totals.lines} lignes</span>
                <div className="flex-1" />
                <span>Commandé : <b className="text-blue-300">{totals.quantity}</b></span>
                <span>Produit : <b className="text-yellow-300">{totals.produced}</b></span>
                <span>Livré : <b className="text-green-300">{totals.delivered}</b></span>
                <span>Reste : <b className="text-orange-300">{totals.remaining}</b></span>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
