"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PLANNING_STATUSES, todayISO } from "@/lib/production-planning-constants";
import { EXPEDITION_PLANNING_FILTERS, filterPlanningRows, summarizePlanning, type PlanningListRow } from "@/lib/planning-list";

/** Bilan en lecture seule : aucun compteur ni état ne peut être modifié ici. */
export default function PlanningOverview({ kind }: { kind: "production" | "expedition" }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [status, setStatus] = useState("");
  const [rows, setRows] = useState<PlanningListRow[]>([]), [error, setError] = useState("");
  const [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setError("");
    apiFetch<{ entries?: PlanningListRow[]; plans?: PlanningListRow[] }>(`/api/${kind}-planning?date=all`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setRows(data.entries || data.plans || []); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Bilan indisponible"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, kind, revision]);
  useEffect(() => {
    if (!open) return;
    const refresh = () => { if (document.visibilityState !== "hidden") setRevision(value => value + 1); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [open]);
  const options = kind === "production" ? PLANNING_STATUSES : EXPEDITION_PLANNING_FILTERS;
  const filtered = filterPlanningRows(rows, query, status), summary = summarizePlanning(filtered);
  return <section className="rounded-xl border border-gray-300 bg-white p-3 text-gray-900 space-y-3">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="font-semibold text-sm">{open ? "▾" : "▸"} Bilan global des plannings {kind === "production" ? "de production" : "d’expédition"} — toutes les dates</button>
    {open && <>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Rechercher dans le bilan global" value={query} onChange={event => setQuery(event.target.value)} placeholder="Article, commande, client, date, usine ou chauffeur…" className="border rounded px-3 py-2 flex-1 min-w-56 text-sm" />
        <select aria-label="État du bilan global" value={status} onChange={event => setStatus(event.target.value)} className="border rounded px-2 text-sm"><option value="">Tous les états</option>{options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
        <button type="button" onClick={() => setRevision(value => value + 1)} className="border rounded px-3 text-sm">Actualiser le bilan</button>
      </div>
      {error ? <p role="alert" className="text-red-700">{error}</p> : loading && !rows.length ? <p role="status">Chargement du bilan…</p> : <>
        {loading && <p className="text-xs">Actualisation du bilan…</p>}
        <p className="text-sm" role="status">{summary.lines} ligne(s) · {summary.articles} article(s) distinct(s) · {summary.orders} commande(s)</p>
        <div className="flex flex-wrap gap-2 text-xs">{options.map(option => <span key={option.key} className="border rounded px-2 py-1">{option.label} : {summary.states[option.key] || 0}</span>)}</div>
        <p className="text-xs text-gray-600">Lecture seule. Une ligne par affectation au planning : un même article peut apparaître sur plusieurs dates. Les quantités ci-dessous ne sont pas des cumuls à additionner à nouveau.</p>
        <div className="overflow-auto max-h-[60vh]"><table className="w-full text-xs" aria-label="Bilan global des plannings"><thead><tr className="text-left"><th>Date</th><th>Article</th><th>Commande</th><th>Client</th><th>{kind === "production" ? "Usine" : "Chauffeur"}</th><th>État</th><th>Planifié</th><th>{kind === "production" ? "Appliqué" : "Livré"}</th></tr></thead><tbody>
          {filtered.map(row => <tr key={row.id} className="border-t"><td className="p-2 whitespace-nowrap">{row.planDate}</td><td className="p-2">{row.articleName}</td><td className="p-2">{row.orderNumber}</td><td className="p-2">{row.clientName}</td><td className="p-2">{row.factoryName || row.driverName || "—"}</td><td className="p-2">{options.find(option => option.key === row.status)?.label || row.status}{kind === "production" && row.status === "EN_COURS" && row.planDate > todayISO() ? " (prévu, date non atteinte)" : ""}</td><td className="p-2">{row.plannedQty}</td><td className="p-2">{kind === "production" ? row.appliedQty ?? 0 : row.loadedQty ?? 0}</td></tr>)}
        </tbody></table>{!filtered.length && <p className="py-5 text-center">Aucune ligne ne correspond aux filtres.</p>}</div>
      </>}
    </>}
  </section>;
}
