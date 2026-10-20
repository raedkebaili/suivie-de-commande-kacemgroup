"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ArticleGroup } from "@/lib/article-grouping";
import { categoryLabel, categoryNeed, categorySpecs, requirementSummary, type RequirementCategory, type RequirementFilters, type RequirementLine } from "@/lib/material-requirements";

type Result = {
  lines: RequirementLine[]; groups: ArticleGroup[]; totals: { groups: number; lines: number; quantity: number };
  categories: RequirementCategory[]; selectedKeys: string[]; canConfigure: boolean;
  summary: ReturnType<typeof requirementSummary>;
  options: Record<"articles" | "families" | "powers" | "clients" | "orderNumbers", string[]>;
};
const control = "w-full min-h-[38px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-100";
const button = "min-h-[38px] px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50";
const defaultFilters: RequirementFilters = { sorts: [{ field: "articleName", direction: "asc" }, { field: "orderNumber", direction: "asc" }], technical: [] };
const baseSorts = [ ["articleName", "Article"], ["power", "Puissance"], ["familyCategory", "Famille"], ["quantity", "Commandé"], ["affaire", "Affaire / besoin"], ["clientName", "Client"], ["orderNumber", "N° Cmd"], ["orderDate", "Date commande"] ];
function ArticleGroupingView({ filters, refreshKey }: { filters: { status: string; agency: string; priority: string }; refreshKey: number }) {
  const [data, setData] = useState<Result | null>(null);
  const [local, setLocal] = useState<RequirementFilters>(defaultFilters);
  const [open, setOpen] = useState(true), [showFilters, setShowFilters] = useState(false), [showConfig, setShowConfig] = useState(false);
  const [draftKeys, setDraftKeys] = useState<string[]>([]), [saving, setSaving] = useState(false), [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(100);
  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (filters.status) sp.set("status", filters.status);
    if (filters.agency) sp.set("agencyId", filters.agency);
    if (filters.priority) sp.set("priority", filters.priority);
    for (const [key, value] of Object.entries(local)) {
      if (key === "sorts" || key === "technical") sp.set(key, JSON.stringify(value));
      else if (Array.isArray(value)) for (const entry of value) sp.append(key, String(entry));
      else if (value) sp.set(key, value);
    }
    return sp.toString();
  }, [filters.status, filters.agency, filters.priority, local]);
  const [requestQuery, setRequestQuery] = useState(query);
  useEffect(() => { const timeout = window.setTimeout(() => setRequestQuery(query), 250); return () => window.clearTimeout(timeout); }, [query]);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController(), id = ++generation.current;
    setLoading(true); setError("");
    apiFetch<Result>(`/api/orders/grouped-articles?${requestQuery}`, { signal: controller.signal })
      .then(result => { if (id === generation.current && !controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted && id === generation.current) setError(err instanceof Error ? err.message : "Chargement impossible"); })
      .finally(() => { if (!controller.signal.aborted && id === generation.current) setLoading(false); });
    return () => controller.abort();
  }, [requestQuery, refreshKey, reload]);
  const categories = useMemo(() => (data?.selectedKeys || []).flatMap(key => (data?.categories || []).filter(c => c.key === key)), [data]);
  const lines = useMemo(() => data?.lines || data?.groups.flatMap(g => g.lines.map(l => ({ ...l, components: l.components || [], groupKey: g.key }))) || [], [data]);
  useEffect(() => { setPage(1); }, [requestQuery]);
  const pageCount = Math.max(1, Math.ceil(lines.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleLines = lines.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const summary = data?.summary || requirementSummary(lines, categories);
  const updating = loading || query !== requestQuery;
  const change = (key: keyof RequirementFilters, value: unknown) => setLocal(prev => ({ ...prev, [key]: value }));
  const sortOptions = [...baseSorts, ...categories.flatMap(c => [[`spec:${c.key}`, c.name], [`total:${c.key}`, `Total ${c.name}`]])];
  const saveConfig = async () => {
    setSaving(true); setNotice("");
    try {
      await apiFetch("/api/orders/grouped-articles/config", { method: "PUT", body: JSON.stringify({ selectedKeys: draftKeys }) });
      setLocal(prev => ({ ...prev, technical: (prev.technical || []).filter(f => draftKeys.includes(f.key)), sorts: (prev.sorts || []).filter(s => !s.field.includes(":") || draftKeys.includes(s.field.slice(s.field.indexOf(":") + 1))) }));
      setShowConfig(false); setNotice("Catégories enregistrées pour tous les utilisateurs."); setReload(n => n + 1);
    } catch (err) { setNotice(err instanceof Error ? err.message : "Enregistrement impossible"); }
    finally { setSaving(false); }
  };
  const exportXlsx = useCallback(async () => {
    setExporting(true); setNotice("");
    try {
      const response = await fetch(`/api/orders/grouped-articles?${requestQuery}&format=xlsx`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error((await response.json()).error || "Export impossible");
      const url = URL.createObjectURL(await response.blob()), a = document.createElement("a");
      a.href = url; a.download = `besoin-matiere-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setNotice(err instanceof Error ? err.message : "Export impossible"); }
    finally { setExporting(false); }
  }, [requestQuery]);
  const needs = (quantity: number, missing: number) => `${quantity.toLocaleString("fr-FR")}${missing ? ` + ? (${missing} ligne${missing > 1 ? "s" : ""})` : ""}`;
  return <section className="mt-6 text-gray-800 dark:text-gray-100" aria-label="Regroupement par article et besoin matière">
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <button className="font-bold text-base mr-2" onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? "▾" : "▸"} Regroupement par Article · Besoin matière</button>
      <span className="text-xs rounded-full px-2 py-1 bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200">{lines.length} ligne(s) · {data?.totals?.groups ?? data?.groups.length ?? 0} groupe(s) · {lines.reduce((s, l) => s + l.quantity, 0).toLocaleString("fr-FR")} commandés</span>
      <div className="flex-1" />
      {open && <><button className={button} onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>Filtres et tris multiples</button>
        {data?.canConfigure && <button className={button} onClick={() => { setDraftKeys(data.selectedKeys); setShowConfig(v => !v); }}>Configurer les catégories</button>}
        <button className={button} disabled={loading} onClick={() => setReload(n => n + 1)}>Actualiser</button>
        <button className={`${button} bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700`} disabled={updating || !!error || !data || exporting} onClick={exportXlsx}>{exporting ? "Export…" : "Exporter Excel"}</button></>}
    </div>
    {open && <>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Besoin brut = quantité commandée × 1 unité de chaque matière sélectionnée. Aucune déduction du stock, de la production ou des livraisons. Le périmètre suit aussi les filtres statut / agence / priorité du tableau Commandes. Les totaux et l’export suivent tous les filtres.</p>
      <label className="block mb-3 max-w-xl text-xs font-medium">Recherche globale<input className={control} value={local.q || ""} onChange={e => change("q", e.target.value)} placeholder="Article, famille, affaire, client, commande, référence matière…" /></label>
      {notice && <p role="status" className="p-3 mb-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">{notice}</p>}
      {showConfig && data?.canConfigure && <div className="rounded-xl border border-blue-300 dark:border-blue-800 p-4 mb-4 bg-blue-50 dark:bg-gray-900">
        <h3 className="font-semibold text-sm">Catégories techniques visibles — configuration système partagée</h3>
        <p className="text-xs mt-1 mb-3">Cochez les catégories, puis ajustez leur ordre. Chaque catégorie ajoute une colonne de spécifications et une colonne de besoin total. Les catégories inactives restent consultables pour l’historique.</p>
        <div className="flex flex-wrap gap-3 mb-3">{data.categories.map(c => <label key={c.key} className="text-sm flex items-center gap-1.5"><input type="checkbox" disabled={saving} checked={draftKeys.includes(c.key)} onChange={e => setDraftKeys(prev => e.target.checked ? [...prev, c.key] : prev.filter(k => k !== c.key))} />{c.name}{c.active === false ? " (historique / inactive)" : ""}</label>)}</div>
        <ol className="space-y-1 mb-3">{draftKeys.map((key, index) => <li key={key} className="flex items-center gap-2 text-xs"><span className="min-w-40">{index + 1}. {data.categories.find(c => c.key === key)?.name}</span>{[-1, 1].map(delta => <button key={delta} className={button} aria-label={`${delta < 0 ? "Monter" : "Descendre"} ${data.categories.find(c => c.key === key)?.name}`} disabled={saving || index + delta < 0 || index + delta >= draftKeys.length} onClick={() => setDraftKeys(prev => { const next = [...prev]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; })}>{delta < 0 ? "↑" : "↓"}</button>)}</li>)}</ol>
        <button className={`${button} bg-blue-600 text-white`} disabled={saving} onClick={saveConfig}>{saving ? "Enregistrement…" : "Enregistrer pour tous"}</button> <button className={button} disabled={saving} onClick={() => setShowConfig(false)}>Annuler</button>
      </div>}
      {showFilters && <div className="p-4 mb-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">{([ ["articles", "Articles"], ["families", "Familles"], ["powers", "Puissances"], ["clients", "Clients"], ["orderNumbers", "N° de commande"] ] as const).map(([key, label]) => <label key={key} className="text-xs font-medium">{label} <span className="font-normal">(choix multiples)</span><select className={control} multiple size={3} value={local[key] || []} onChange={e => change(key, Array.from(e.target.selectedOptions, o => o.value))}>{(data?.options?.[key] || []).map(v => <option key={v} value={v}>{key === "powers" ? v === "unknown" ? "Non précisée" : `${v} W` : v}</option>)}</select></label>)}</div>
        <p className="text-xs text-gray-500">Plusieurs valeurs d’un même filtre sont combinées par OU ; les filtres différents se combinent par ET. Ctrl/Cmd + clic pour sélectionner plusieurs valeurs.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">{([ ["affaire", "Affaire / besoin", "text"], ["dateFrom", "Commande depuis", "date"], ["dateTo", "Commande jusqu’au", "date"], ["minQuantity", "Commandé minimum", "number"], ["maxQuantity", "Commandé maximum", "number"] ] as const).map(([key, label, type]) => <label key={key} className="text-xs font-medium">{label}<input className={control} type={type} min={type === "number" ? 0 : undefined} value={local[key] || ""} onChange={e => change(key, e.target.value)} /></label>)}
          <label className="text-xs font-medium">Spécifications<select className={control} value={local.completeness || ""} onChange={e => change("completeness", e.target.value)}><option value="">Toutes</option><option value="complete">Catégories visibles renseignées</option><option value="missing">Au moins une catégorie manquante</option></select></label>
        </div>
        {categories.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{categories.map(category => {
          const filter = local.technical?.find(f => f.key === category.key) || { key: category.key, text: "", mode: "contains" };
          const update = (patch: Partial<typeof filter>) => change("technical", [...(local.technical || []).filter(f => f.key !== category.key), { ...filter, ...patch }].filter(f => f.text || f.mode !== "contains"));
          return <div key={category.key}><label className="text-xs font-medium">Filtre {category.name}<select className={control} value={filter.mode} onChange={e => update({ mode: e.target.value })}><option value="contains">Référence / désignation contient</option><option value="present">Renseignée</option><option value="missing">Non renseignée</option></select></label>{filter.mode === "contains" && <input aria-label={`Référence ou matière ${category.name}`} className={`${control} mt-1`} value={filter.text} onChange={e => update({ text: e.target.value })} />}</div>;
        })}</div>}
        <fieldset className="space-y-2"><legend className="font-semibold text-sm mb-2">Tri à plusieurs niveaux (dans cet ordre)</legend>{(local.sorts || []).map((sort, index) => <div key={index} className="flex gap-2 items-center"><span className="text-xs">{index + 1}.</span><select aria-label={`Champ de tri ${index + 1}`} className={`${control} max-w-xs`} value={sort.field} onChange={e => change("sorts", local.sorts!.map((s, i) => i === index ? { ...s, field: e.target.value } : s))}>{sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label={`Sens de tri ${index + 1}`} className={`${control} max-w-40`} value={sort.direction} onChange={e => change("sorts", local.sorts!.map((s, i) => i === index ? { ...s, direction: e.target.value } : s))}><option value="asc">Croissant</option><option value="desc">Décroissant</option></select><button className={button} aria-label={`Supprimer le tri ${index + 1}`} onClick={() => change("sorts", local.sorts!.filter((_, i) => i !== index))}>×</button></div>)}<button className={button} disabled={(local.sorts || []).length >= 3} onClick={() => change("sorts", [...(local.sorts || []), { field: "quantity", direction: "desc" }])}>Ajouter un tri (max. 3)</button></fieldset>
        <button className={button} onClick={() => setLocal(defaultFilters)}>Réinitialiser les filtres et tris du regroupement</button>
      </div>}
      {error && <div role="alert" className="p-3 mb-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200">{error} <button className="underline" onClick={() => { setLocal(defaultFilters); setReload(n => n + 1); }}>Réinitialiser et réessayer</button></div>}
      {updating && <p role="status" className="text-sm text-blue-600 mb-2">Actualisation du besoin matière…</p>}
      {!error && data && <>
        {!categories.length && <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">Aucune catégorie technique sélectionnée. L’administrateur peut les configurer ci-dessus.</p>}
        <div className={`overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 ${updating ? "opacity-60" : ""}`} aria-busy={updating}>
          <table className="w-full text-xs text-left whitespace-nowrap"><caption className="sr-only">Articles et besoins matières pour les lignes filtrées</caption><thead className="bg-gray-100 dark:bg-gray-800"><tr>{["Article", "Puissance", "Famille", "Commandé", "Affaire / besoin", "Client", "N° Cmd", ...categories.map(c => c.name), ...categories.map(c => `Total ${c.name}`)].map((label, i) => <th scope="col" key={i} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{visibleLines.map((line, index) => <tr key={line.itemId ?? index} className="hover:bg-blue-50 dark:hover:bg-gray-800">
              <td className="px-3 py-2 max-w-80 whitespace-normal font-medium" title={`Sous-famille / variante : ${line.groupKey}`}>{line.articleName}</td><td className="px-3 py-2">{line.power === null ? "Non précisée" : `${line.power} W`}</td><td className="px-3 py-2 whitespace-normal">{line.familyCategory || "Non classée"}</td><td className="px-3 py-2 text-right font-semibold">{line.quantity.toLocaleString("fr-FR")}</td><td className="px-3 py-2 whitespace-normal">{line.affaire || "—"}</td><td className="px-3 py-2 whitespace-normal">{line.clientName || "—"}</td><td className="px-3 py-2">{line.orderNumber || "—"}</td>
              {categories.map(c => <td key={c.key} className="px-3 py-2 min-w-48 max-w-96 whitespace-normal">{categoryLabel(line, c.key) || <span className="text-amber-700 dark:text-amber-300">Non renseigné</span>}{categorySpecs(line, c.key).some(spec => spec.legacy) && <span className="block text-[10px] text-amber-700 dark:text-amber-300">Saisie ancienne à vérifier</span>}</td>)}
              {categories.map(c => <td key={c.key} className="px-3 py-2 text-right font-semibold text-blue-800 dark:text-blue-200">{categoryNeed(line, c.key)?.toLocaleString("fr-FR") ?? "?"}</td>)}
            </tr>)}{!lines.length && <tr><td colSpan={7 + 2 * categories.length} className="px-3 py-6 text-center text-gray-500">Aucun article ne correspond aux filtres.</td></tr>}</tbody>
            <tfoot className="bg-blue-50 dark:bg-blue-950 font-semibold"><tr><td colSpan={3} className="px-3 py-3">TOTAL DES LIGNES FILTRÉES</td><td className="px-3 py-3 text-right">{lines.reduce((s, l) => s + l.quantity, 0).toLocaleString("fr-FR")}</td><td colSpan={3 + categories.length} />{summary.map(c => <td key={c.key} className="px-3 py-3 text-right" title="Quantité connue + lignes dont les spécifications sont manquantes">{needs(c.quantity, c.missingLines)}</td>)}</tr></tfoot>
          </table>
        </div>
        <div className="flex flex-wrap gap-3 items-center justify-between text-xs mt-2">
          <span>{lines.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, lines.length)} / {lines.length} lignes · Totaux et export : toutes les lignes filtrées</span>
          <div className="flex items-center gap-2"><label>Lignes par page <select className="rounded border bg-white dark:bg-gray-800 p-1" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[50, 100, 250].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <button className={button} disabled={currentPage <= 1 || updating} onClick={() => setPage(currentPage - 1)}>Précédent</button><span>{currentPage} / {pageCount}</span><button className={button} disabled={currentPage >= pageCount || updating} onClick={() => setPage(currentPage + 1)}>Suivant</button></div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 my-2">« ? » = catégorie non renseignée, jamais assimilée à zéro. Un total « + ? » est partiel. Les anciennes saisies textuelles sont comptées comme une sélection unique à vérifier. Les caractéristiques (couleur, classe…) sont des occurrences de spécification, pas nécessairement des pièces à acheter.</p>
        {summary.length > 0 && <details open className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-3"><summary className="font-semibold text-sm cursor-pointer">Synthèse du besoin par catégorie et référence matière</summary><div className="overflow-x-auto mt-3"><table className="w-full text-xs text-left"><thead className="bg-gray-100 dark:bg-gray-800"><tr>{["Catégorie", "Référence", "Matière", "Besoin (unités)"].map(h => <th scope="col" key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{summary.flatMap(c => [
          ...c.materials.map((m, i) => <tr key={`${c.key}-${i}`} className="border-b border-gray-100 dark:border-gray-800"><td className="p-2">{c.name}</td><td className="p-2">{m.reference || "Sans référence"}</td><td className="p-2">{m.label}{m.legacy && " (ancienne saisie à vérifier)"}</td><td className="p-2 font-semibold">{m.quantity.toLocaleString("fr-FR")}</td></tr>),
          <tr key={`${c.key}-total`} className="bg-blue-50 dark:bg-blue-950 font-semibold"><td className="p-2" colSpan={3}>Total {c.name}{c.missingLines ? " — partiel" : ""}</td><td className="p-2">{needs(c.quantity, c.missingLines)}</td></tr>,
        ])}</tbody></table></div></details>}
      </>}
    </>}
  </section>;
}
export default memo(ArticleGroupingView);
