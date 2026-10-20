"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import MaterialRequirementsSummary from "./MaterialRequirementsSummary";
import { apiFetch } from "@/lib/api";
import type { ArticleGroup, GroupedLine, PowerBreakdown } from "@/lib/article-grouping";
import { UNCLASSIFIED_GROUP_KEY, type FamilySource } from "@/lib/article-family";

import { GROUPING_COLUMNS, DEFAULT_GROUPING_COLUMNS, canonicalGroupingColumns, groupingCell, type GroupingColumnKey } from "@/lib/article-grouping-columns";

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
function PowerBreakdownBar({ breakdown, visible }: { breakdown: PowerBreakdown[]; visible: GroupingColumnKey[] }) {
  if (breakdown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 self-center mr-1">Par puissance :</span>
      {breakdown.map(b => (
        <span key={String(b.power)} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs">
          <b className="text-gray-800 dark:text-gray-100">{powerLabel(b.power)}</b>
          <span className="text-gray-500 dark:text-gray-400">{b.lines} ligne(s)</span>
          {visible.includes("quantity") && <Metric label="Commandé" value={b.quantity} tone="text-blue-700 dark:text-blue-400" />}
          {visible.includes("remaining") && <Metric label="Reste à livrer" value={b.remaining} tone="text-orange-600 dark:text-orange-400" />}
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

  const [visibleColumns, setVisibleColumns] = useState<GroupingColumnKey[]>(DEFAULT_GROUPING_COLUMNS);
  const [columnsReady, setColumnsReady] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [draftColumns, setDraftColumns] = useState<GroupingColumnKey[]>(DEFAULT_GROUPING_COLUMNS);
  const [savingColumns, setSavingColumns] = useState(false);
  const [columnsMessage, setColumnsMessage] = useState("");
  const [columnsError, setColumnsError] = useState("");
  const columnsVersion = useRef(0);
  const columns = GROUPING_COLUMNS.filter(column => visibleColumns.includes(column.key));
  const shown = (key: GroupingColumnKey) => visibleColumns.includes(key);

  // Règle commune en base : les sessions déjà ouvertes se mettent à jour aussi.
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      const version = columnsVersion.current;
      try {
        const config = await apiFetch<{ visibleColumns: GroupingColumnKey[]; canConfigure: boolean }>("/api/orders/grouped-articles/columns", { signal: controller.signal });
        if (!controller.signal.aborted && version === columnsVersion.current) {
          setVisibleColumns(canonicalGroupingColumns(config.visibleColumns || DEFAULT_GROUPING_COLUMNS));
          setCanConfigure(config.canConfigure === true); setColumnsReady(true); setColumnsError("");
        }
      } catch (err) { if (!controller.signal.aborted) setColumnsError(err instanceof Error ? err.message : "Lecture des colonnes impossible"); }
      finally { running = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, []);

  const saveColumns = async () => {
    setSavingColumns(true); setColumnsMessage(""); columnsVersion.current++;
    try {
      const result = await apiFetch<{ visibleColumns: GroupingColumnKey[] }>("/api/orders/grouped-articles/columns", { method: "PUT", body: JSON.stringify({ visibleColumns: draftColumns }) });
      columnsVersion.current++;
      setVisibleColumns(result.visibleColumns); setShowColumns(false); setColumnsError("");
      setColumnsMessage("Affichage enregistré pour tous les utilisateurs. Les sessions ouvertes se mettent à jour sous 30 secondes ou au retour sur la page.");
    } catch (err) { setColumnsMessage(err instanceof Error ? err.message : "Enregistrement impossible"); }
    finally { setSavingColumns(false); }
  };

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
          <button onClick={exportXlsx} disabled={!columnsReady || !columns.length} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">📤 Exporter</button>
          {canConfigure && <button onClick={() => { setDraftColumns([...visibleColumns]); setShowColumns(v => !v); setColumnsMessage(""); }} aria-expanded={showColumns} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">Colonnes — affichage pour tous</button>}
        </>}
      </div>

      {columnsMessage && <p role="status" className="mb-3 text-sm text-blue-700 dark:text-blue-300">{columnsMessage}</p>}
      {columnsError && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{columnsError}</p>}
      {open && showColumns && canConfigure && <div className="mb-4 p-4 rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-gray-900">
        <h3 className="font-semibold text-sm">Colonnes des tableaux de regroupement — règle commune à tous</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Choisissez les colonnes visibles dans tous les groupes. La synthèse matière en dessous reste indépendante.</p>
        <fieldset disabled={savingColumns} className="flex flex-wrap gap-4 mb-3">
          <legend className="sr-only">Colonnes visibles</legend>
          {GROUPING_COLUMNS.map(column => <label key={column.key} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={draftColumns.includes(column.key)} onChange={event => setDraftColumns(previous => event.target.checked ? canonicalGroupingColumns([...previous, column.key]) : previous.filter(key => key !== column.key))} />{column.label}</label>)}
        </fieldset>
        <div className="flex flex-wrap gap-2 text-sm">
          <button disabled={savingColumns} onClick={() => setDraftColumns([...DEFAULT_GROUPING_COLUMNS])} className="border rounded-lg px-3 py-2">Tout afficher</button>
          <button disabled={savingColumns} onClick={() => setDraftColumns([])} className="border rounded-lg px-3 py-2">Tout masquer</button>
          <button disabled={savingColumns} onClick={saveColumns} className="bg-blue-600 text-white rounded-lg px-3 py-2">{savingColumns ? "Enregistrement…" : "Enregistrer pour tous"}</button>
          <button disabled={savingColumns} onClick={() => setShowColumns(false)} className="border rounded-lg px-3 py-2">Annuler</button>
        </div>
      </div>}

      {open && (
        error ? (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>
        ) : loading || !columnsReady ? (
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
                      {shown("quantity") && <Metric label="Commandé" value={g.totalQuantity} tone="text-blue-700 dark:text-blue-400" />}
                      {shown("producedQty") && <Metric label="Produit" value={g.totalProduced} tone="text-gray-700 dark:text-gray-200" />}
                      {shown("deliveredQty") && <Metric label="Livré" value={g.totalDelivered} tone="text-gray-700 dark:text-gray-200" />}
                      {shown("remaining") && <Metric label="Reste à livrer" value={g.totalRemaining} tone="text-orange-600 dark:text-orange-400" />}
                    </div>
                  </button>

                  {!isCollapsed && (
                    <>
                    {shown("power") && <PowerBreakdownBar breakdown={g.powerBreakdown} visible={visibleColumns} />}
                    {!columns.length ? <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Toutes les colonnes de ce regroupement sont masquées par l’administrateur.</p> : <div className="overflow-x-auto">
                      <table aria-label={`Regroupement classique ${g.key}`} className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 text-left">
                            {columns.map(column => <th key={column.key} scope="col" className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">{column.label}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {g.lines.map((l, i) => {
                            // Séparateur visuel quand l'article change dans le groupe
                            const newArticle = i === 0 || l.articleName !== g.lines[i - 1].articleName;
                            return (
                              <tr key={`${g.key}-${i}`} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${newArticle && i > 0 ? "border-t-2 border-t-gray-300 dark:border-t-gray-600" : ""}`}>
                                {columns.map(column => <td key={column.key} className={`px-3 py-1.5 ${["quantity", "producedQty", "deliveredQty", "remaining"].includes(column.key) ? "text-right font-semibold" : ""} ${newArticle ? "text-gray-800 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>{groupingCell(l, column.key)}</td>)}
                              </tr>
                            );
                          })}
                          <tr aria-label={`Total ${g.key}`} className="bg-slate-50 dark:bg-gray-800 font-bold border-t-2 border-gray-300 dark:border-gray-600">
                            {columns.map((column, index) => {
                              const values: Partial<Record<GroupingColumnKey, number>> = { quantity: g.totalQuantity, producedQty: g.totalProduced, deliveredQty: g.totalDelivered, remaining: g.totalRemaining };
                              const labelColumn = columns.find(c => !["quantity", "producedQty", "deliveredQty", "remaining"].includes(c.key));
                              return <td key={column.key} className="px-3 py-1.5 text-gray-700 dark:text-gray-200">{index === 0 && <span className="sr-only">Total du groupe </span>}{values[column.key] ?? (column.key === labelColumn?.key ? `Total « ${g.key} »` : "")}</td>;
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>}
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
                {shown("quantity") && <span>Commandé : <b className="text-blue-300">{totals.quantity}</b></span>}
                {shown("producedQty") && <span>Produit : <b className="text-yellow-300">{totals.produced}</b></span>}
                {shown("deliveredQty") && <span>Livré : <b className="text-green-300">{totals.delivered}</b></span>}
                {shown("remaining") && <span>Reste : <b className="text-orange-300">{totals.remaining}</b></span>}
              </div>
            )}
          </div>
        )
      )}
      <MaterialRequirementsSummary filters={filters} refreshKey={refreshKey} />
    </div>
  );
}

export default memo(ArticleGroupingView, (previous, next) =>
  previous.refreshKey === next.refreshKey &&
  previous.filters.status === next.filters.status &&
  previous.filters.agency === next.filters.agency &&
  previous.filters.priority === next.filters.priority,
);
