"use client";
import { memo, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { RequirementCategory, RequirementFilters, MaterialSummaryFilters, requirementSummary } from "@/lib/material-requirements";

type Filters = RequirementFilters & MaterialSummaryFilters;
type Result = {
  summary: ReturnType<typeof requirementSummary>;
  categories: RequirementCategory[]; categoryOptions: RequirementCategory[];
  totals: { lines: number; quantity: number };
  options: Record<"articles" | "families" | "powers" | "clients" | "orderNumbers", string[]>;
};
const control = "w-full min-h-[38px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-100";
const button = "min-h-[38px] px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50";
const defaultFilters: Filters = {};
function MaterialRequirementsSummary({ filters, refreshKey }: { filters: { status: string; agency: string; priority: string }; refreshKey: number }) {
  const [data, setData] = useState<Result | null>(null);
  const [local, setLocal] = useState<Filters>(defaultFilters);
  const [open, setOpen] = useState(true), [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true), [exporting, setExporting] = useState(false), [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (filters.status) sp.set("status", filters.status);
    if (filters.agency) sp.set("agencyId", filters.agency);
    if (filters.priority) sp.set("priority", filters.priority);
    for (const [key, value] of Object.entries(local)) {
      if (key === "sorts" || key === "technical") sp.set(key, JSON.stringify(value));
      else if (Array.isArray(value)) value.forEach(v => sp.append(key, String(v)));
      else if (value) sp.set(key, value);
    }
    return sp.toString();
  }, [filters.status, filters.agency, filters.priority, local]);
  const [requestQuery, setRequestQuery] = useState(query);
  useEffect(() => { const timeout = window.setTimeout(() => setRequestQuery(query), 250); return () => window.clearTimeout(timeout); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    apiFetch<Result>(`/api/orders/material-requirements?${requestQuery}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Chargement impossible"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestQuery, refreshKey, reload]);
  const categories = data?.categories || [];
  const summary = data?.summary || [];
  const updating = loading || query !== requestQuery;
  const change = (key: keyof Filters, value: unknown) => setLocal(prev => ({ ...prev, [key]: value }));
  const exportXlsx = async () => {
    setExporting(true); setError("");
    try {
      const response = await fetch(`/api/orders/material-requirements?${requestQuery}&format=xlsx`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error((await response.json()).error || "Export impossible");
      const url = URL.createObjectURL(await response.blob()), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `synthese-besoin-matiere-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : "Export impossible"); }
    finally { setExporting(false); }
  };
  return <section aria-label="Synthèse du besoin par catégorie et référence matière" className="mt-8 border-t-2 border-blue-200 dark:border-blue-900 pt-5 text-gray-800 dark:text-gray-100">
    <div className="flex flex-wrap gap-2 items-center mb-3">
      <button className="font-bold text-base text-left" onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? "▾" : "▸"} Synthèse du besoin par catégorie et référence matière</button>
      <div className="flex-1" />
      {open && <><button className={button} onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>Filtrer les articles sources</button><button className={button} onClick={() => setReload(n => n + 1)} disabled={loading}>Actualiser la synthèse</button><button className={`${button} bg-emerald-600 text-white hover:bg-emerald-700`} disabled={updating || !!error || !data || exporting} onClick={exportXlsx}>{exporting ? "Export…" : "Exporter la synthèse"}</button></>}
    </div>
    {open && <>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Toutes les matières renseignées dans les détails techniques des articles sont prises en compte. Besoin brut = quantité commandée × 1 unité de chaque matière sélectionnée, sans déduction du stock ou des livraisons. Les filtres ci-dessous agissent uniquement sur cette synthèse : les tableaux classiques au-dessus sont conservés.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-xl bg-blue-50 dark:bg-gray-900 mb-3">
        <label className="text-xs font-medium">Recherche matière / référence<input className={control} value={local.materialQ || ""} onChange={e => change("materialQ", e.target.value)} placeholder="Référence ou désignation de matière…" /></label>
        <label className="text-xs font-medium">Catégorie matière<select className={control} value={local.materialCategory || ""} onChange={e => change("materialCategory", e.target.value)}><option value="">Toutes les catégories renseignées</option>{(data?.categoryOptions || categories).map(c => <option key={c.key} value={c.key}>{c.name}</option>)}</select></label>
        <label className="text-xs font-medium">Besoin minimum<input className={control} type="number" min={0} value={local.minNeed || ""} onChange={e => change("minNeed", e.target.value)} /></label>
        <label className="text-xs font-medium">Besoin maximum<input className={control} type="number" min={0} value={local.maxNeed || ""} onChange={e => change("maxNeed", e.target.value)} /></label>
        <label className="text-xs font-medium">Tri des matières par catégorie<select className={control} value={local.materialSort || "reference"} onChange={e => change("materialSort", e.target.value)}><option value="reference">Référence</option><option value="label">Désignation</option><option value="quantity">Besoin (numérique)</option></select></label>
        <label className="text-xs font-medium">Sens de tri des matières<select className={control} value={local.materialDirection || "asc"} onChange={e => change("materialDirection", e.target.value)}><option value="asc">Croissant</option><option value="desc">Décroissant</option></select></label>
        <button className={button} onClick={() => setLocal(defaultFilters)}>Réinitialiser la synthèse</button>
      </div>
      {showFilters && <div className="p-4 mb-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">{([ ["articles", "Articles"], ["families", "Familles"], ["powers", "Puissances"], ["clients", "Clients"], ["orderNumbers", "N° de commande"] ] as const).map(([key, label]) => <label key={key} className="text-xs font-medium">{label} <span className="font-normal">(choix multiples)</span><select className={control} multiple size={3} value={local[key] || []} onChange={e => change(key, Array.from(e.target.selectedOptions, o => o.value))}>{(data?.options?.[key] || []).map(v => <option key={v} value={v}>{key === "powers" ? v === "unknown" ? "Non précisée" : `${v} W` : v}</option>)}</select></label>)}</div>
        <p className="text-xs text-gray-500">Plusieurs valeurs d’un même filtre sont combinées par OU ; les filtres différents se combinent par ET. Ctrl/Cmd + clic pour sélectionner plusieurs valeurs.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">{([ ["affaire", "Affaire / besoin", "text"], ["dateFrom", "Commande depuis", "date"], ["dateTo", "Commande jusqu’au", "date"], ["minQuantity", "Commandé minimum", "number"], ["maxQuantity", "Commandé maximum", "number"] ] as const).map(([key, label, type]) => <label key={key} className="text-xs font-medium">{label}<input className={control} type={type} min={type === "number" ? 0 : undefined} value={local[key] || ""} onChange={e => change(key, e.target.value)} /></label>)}
          <label className="text-xs font-medium">Spécifications<select className={control} value={local.completeness || ""} onChange={e => change("completeness", e.target.value)}><option value="">Toutes</option><option value="complete">Toutes les catégories renseignées</option><option value="missing">Au moins une catégorie manquante</option></select></label>
        </div>
        {categories.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{categories.map(category => {
          const filter = local.technical?.find(f => f.key === category.key) || { key: category.key, text: "", mode: "contains" };
          const update = (patch: Partial<typeof filter>) => change("technical", [...(local.technical || []).filter(f => f.key !== category.key), { ...filter, ...patch }].filter(f => f.text || f.mode !== "contains"));
          return <div key={category.key}><label className="text-xs font-medium">Filtre {category.name}<select className={control} value={filter.mode} onChange={e => update({ mode: e.target.value })}><option value="contains">Référence / désignation contient</option><option value="present">Renseignée</option><option value="missing">Non renseignée</option></select></label>{filter.mode === "contains" && <input aria-label={`Référence ou matière ${category.name}`} className={`${control} mt-1`} value={filter.text} onChange={e => update({ text: e.target.value })} />}</div>;
        })}</div>}
        <button className={button} onClick={() => setLocal(defaultFilters)}>Réinitialiser uniquement les filtres de la synthèse</button>
      </div>}
      {error && <p role="alert" className="p-3 mb-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200">{error}</p>}
      {updating && <p role="status" className="text-sm text-blue-600 mb-2">Actualisation de la synthèse…</p>}
      {!error && data && <>
        <p className="text-xs text-gray-500 mb-2">{summary.reduce((sum, c) => sum + c.materials.length, 0)} référence(s) affichée(s) · {data.totals?.lines || 0} ligne(s) d’articles sources · Périmètre hérité : statut / agence / priorité du tableau Commandes.</p>
        <div className={`overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 ${updating ? "opacity-60" : ""}`} aria-busy={updating}>
          <table className="w-full text-sm text-left"><caption className="sr-only">Synthèse du besoin par catégorie et référence matière</caption>
            <thead className="bg-gray-100 dark:bg-gray-800"><tr>{["Catégorie", "Référence", "Matière", "Besoin (unités)"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
            <tbody>{summary.flatMap(category => [
              ...category.materials.map((material, index) => <tr key={`${category.key}-${index}`} className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-gray-800"><td className="p-3">{category.name}</td><td className="p-3 font-mono text-xs">{material.reference || "Sans référence"}</td><td className="p-3">{material.label}{material.legacy && <span className="block text-xs text-amber-700 dark:text-amber-300">Saisie ancienne à vérifier</span>}</td><td className="p-3 font-semibold text-blue-800 dark:text-blue-200">{material.quantity.toLocaleString("fr-FR")}</td></tr>),
              <tr key={`${category.key}-total`} className="bg-blue-50 dark:bg-blue-950 font-semibold"><td colSpan={3} className="p-3">Total {category.name} — matières affichées{category.missingLines > 0 && <span className="block text-xs font-normal text-amber-700 dark:text-amber-300">{category.missingLines} ligne(s) d’articles sources sans cette catégorie : besoin non renseigné, non assimilé à zéro.</span>}</td><td className="p-3">{category.quantity.toLocaleString("fr-FR")}{category.missingLines ? " + ?" : ""}</td></tr>,
            ])}{!summary.length && <tr><td colSpan={4} className="p-6 text-center text-gray-500">Aucune matière renseignée ne correspond aux filtres de la synthèse.</td></tr>}</tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Les sous-totaux portent sur les références affichées après filtrage. Une spécification absente n’est jamais un zéro. Les anciennes saisies textuelles sont comptées comme une sélection unique à vérifier. Les caractéristiques (couleur, classe…) sont des occurrences de spécification, pas nécessairement des pièces à acheter.</p>
      </>}
    </>}
  </section>;
}
export default memo(MaterialRequirementsSummary);
