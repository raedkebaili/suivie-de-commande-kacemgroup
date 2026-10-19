"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ArticleGroup, GroupedLine, PowerBreakdown } from "@/lib/article-grouping";
import { UNCLASSIFIED_GROUP_KEY, type FamilySource } from "@/lib/article-family";

const powerLabel = (power: number | null) => (power === null ? "Puissance non précisée" : `${power} W`);

/** Origine lisible de la famille d'une ligne (manuel prime sur automatique) */
function OriginBadge({ source }: { source: FamilySource | "MIXTE" | null }) {
  if (source === "MIXTE") return <span className="text-[10px] text-gray-500 dark:text-gray-400">Reconnaissance mixte</span>;
  if (source === "MANUEL") return <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 text-[10px] font-semibold whitespace-nowrap" title="Famille affectée manuellement (catalogue)">Manuel</span>;
  if (source === "AUTOMATIQUE") return <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-[10px] font-semibold whitespace-nowrap" title="Famille reconnue automatiquement">Auto</span>;
  return <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[10px] font-semibold whitespace-nowrap">À classifier</span>;
}

/** Trois compteurs lisibles d'un groupe ou d'une répartition */
function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <b className={`text-sm ${tone}`}>{value}</b>
    </span>
  );
}

/** Répartition par puissance d'un groupe : une puce par puissance */
function PowerBreakdownBar({ breakdown }: { breakdown: PowerBreakdown[] }) {
  if (breakdown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 self-center mr-1">Par puissance :</span>
      {breakdown.map(b => (
        <span key={String(b.power)} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs">
          <b className="text-gray-800 dark:text-gray-100">{powerLabel(b.power)}</b>
          <span className="text-gray-500 dark:text-gray-400">{b.lines} ligne(s)</span>
          <Metric label="Commandé" value={b.quantity} tone="text-blue-700 dark:text-blue-400" />
          <Metric label="Reste à livrer" value={b.remaining} tone="text-orange-600 dark:text-orange-400" />
        </span>
      ))}
    </div>
  );
}

/** Origine d'un groupe : tous manuels, tous automatiques, mixte ou à classifier */
function groupOrigin(lines: GroupedLine[]): FamilySource | "MIXTE" | null {
  const sources = new Set(lines.map(l => l.familySource));
  if (sources.size === 1) return [...sources][0];
  return "MIXTE";
}

type Totals = { groups: number; lines: number; quantity: number; produced: number; delivered: number; remaining: number };

/**
 * Tableau de regroupement des articles par famille identifiée (voir src/lib/article-family.ts).
 * Affiché sous les études photométriques dans l'onglet Commandes.
 *
 * « Toujours à jour » : rechargé à chaque changement de filtre et à chaque
 * rafraîchissement du tableau des commandes (prop refreshKey), donc les
 * nouvelles commandes apparaissent automatiquement.
 */
function ArticleGroupingView({
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
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchDraft), 180);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

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
        credentials: "same-origin",
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
        (l.familyCategory || "").toLowerCase().includes(q) ||
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
        <span className="text-[11px] text-gray-400 italic">Groupes par sous-famille et variante du catalogue ; la colonne Famille affiche la catégorie définie. Les puissances sont détaillées dans chaque groupe. « À classifier » est affiché à part.</span>
        <div className="flex-1" />
        {open && <>
          <input type="text" value={searchDraft} onChange={e => setSearchDraft(e.target.value)} placeholder="🔍 Filtrer article, affaire, client..."
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
                  <button onClick={() => toggleGroup(g.key)} aria-expanded={!isCollapsed}
                    className={`w-full flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 text-left transition-colors ${g.key === UNCLASSIFIED_GROUP_KEY ? "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40" : "bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700"}`}>
                    <span className="text-gray-500 dark:text-gray-400 text-xs">{isCollapsed ? "▸" : "▾"}</span>
                    <span className={`font-bold text-sm px-2.5 py-0.5 rounded text-white ${g.key === UNCLASSIFIED_GROUP_KEY ? "bg-amber-600" : "bg-blue-600"}`}>{g.key}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{g.variants.length} article(s) · {g.lines.length} ligne(s)</span>
                    <OriginBadge source={groupOrigin(g.lines)} />
                    <div className="flex-1" />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Metric label="Commandé" value={g.totalQuantity} tone="text-blue-700 dark:text-blue-400" />
                      <Metric label="Produit" value={g.totalProduced} tone="text-gray-700 dark:text-gray-200" />
                      <Metric label="Livré" value={g.totalDelivered} tone="text-gray-700 dark:text-gray-200" />
                      <Metric label="Reste à livrer" value={g.totalRemaining} tone="text-orange-600 dark:text-orange-400" />
                    </div>
                  </button>

                  {!isCollapsed && (
                    <>
                    <PowerBreakdownBar breakdown={g.powerBreakdown} />
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 text-left">
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Article</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Puissance</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Famille</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right" title="Quantité commandée">Commandé</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Affaire</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Client</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">N° Cmd</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right" title="Quantité produite">Produit</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right" title="Quantité livrée">Livré</th>
                            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Reste à livrer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {g.lines.map((l, i) => {
                            // Séparateur visuel quand l'article change dans le groupe
                            const newArticle = i === 0 || l.articleName !== g.lines[i - 1].articleName;
                            return (
                              <tr key={`${g.key}-${i}`} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${newArticle && i > 0 ? "border-t-2 border-t-gray-300 dark:border-t-gray-600" : ""}`}>
                                <td className={`px-3 py-1.5 ${newArticle ? "font-semibold text-gray-800 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>
                                  {l.articleName}
                                </td>
                                <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{l.power === null ? <span className="text-gray-400 italic">—</span> : `${l.power} W`}</td>
                                <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{l.familyCategory || <span className="text-gray-400 italic">Non définie dans le catalogue</span>}</td>
                                <td className="px-3 py-1.5 text-right font-bold text-blue-700 dark:text-blue-400">{l.quantity}</td>
                                <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{l.affaire || <span className="text-gray-400 italic">—</span>}</td>
                                <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{l.clientName || "-"}</td>
                                <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 font-mono text-[10px]">{l.orderNumber || "-"}</td>
                                <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{l.producedQty}</td>
                                <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{l.deliveredQty}</td>
                                <td className="px-3 py-1.5 text-right font-semibold text-orange-600 dark:text-orange-400">{l.remaining}</td>
                              </tr>
                            );
                          })}
                          <tr className="bg-slate-50 dark:bg-gray-800 font-bold border-t-2 border-gray-300 dark:border-gray-600">
                            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">Total « {g.key} »</td>
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5 text-right text-blue-700 dark:text-blue-400">{g.totalQuantity}</td>
                            <td className="px-3 py-1.5" colSpan={3}></td>
                            <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-200">{g.totalProduced}</td>
                            <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-200">{g.totalDelivered}</td>
                            <td className="px-3 py-1.5 text-right text-orange-600 dark:text-orange-400">{g.totalRemaining}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    </>
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

export default memo(ArticleGroupingView, (previous, next) =>
  previous.refreshKey === next.refreshKey &&
  previous.filters.status === next.filters.status &&
  previous.filters.agency === next.filters.agency &&
  previous.filters.priority === next.filters.priority,
);
