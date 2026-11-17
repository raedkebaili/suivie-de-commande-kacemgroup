"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api";
import type { DelayGroup } from "@/lib/delay-statistics";
type Report = { total: DelayGroup; factories: DelayGroup[]; today: string };
export default function DelayStatistics() {
  const [production, setProduction] = useState(""), [expedition, setExpedition] = useState("");
  const [targets, setTargets] = useState({ production: "", expedition: "" });
  const [factory, setFactory] = useState(""), [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError("");
    const params = new URLSearchParams();
    if (targets.production !== "") params.set("productionDays", targets.production);
    if (targets.expedition !== "") params.set("expeditionDays", targets.expedition);
    apiFetch<Report>(`/api/dashboard/delays?${params}`, { signal: abort.signal }).then(report => { if (!abort.signal.aborted) setData(report); })
      .catch(err => { if (!abort.signal.aborted) { setData(null); setError(err instanceof Error ? err.message : "Statistiques indisponibles"); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [targets, revision]);
  const selected = factory ? data?.factories.find(row => row.factory === factory) : data?.total;
  const rows = factory === "compare" ? data?.factories || [] : selected ? [selected] : [];
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:bg-gray-900 dark:border-gray-700 space-y-3">
    <h3 className="font-semibold">Délais et taux de retard — production / expédition</h3>
    <p className="text-xs text-gray-600 dark:text-gray-300">Départ : date de commande saisie par le commercial. Fin datée d’après les mouvements enregistrés (date serveur). Durées en jours calendaires jusqu’à la fin complète de production ou à la livraison totale. Prévisions et commandes annulées exclues.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setTargets({ production, expedition }); }}>
      <label className="text-xs">Délai cible production (jours)<input aria-label="Délai cible production en jours" type="number" min="0" max="36500" step="1" value={production} onChange={event => setProduction(event.target.value)} placeholder="À définir" className="block w-40 border rounded p-2" /></label>
      <label className="text-xs">Délai cible livraison totale (jours)<input aria-label="Délai cible livraison en jours" type="number" min="0" max="36500" step="1" value={expedition} onChange={event => setExpedition(event.target.value)} placeholder="À définir" className="block w-40 border rounded p-2" /></label>
      <button type="submit" className="rounded border px-3 py-2 text-sm">Calculer les taux</button>
      <button type="button" onClick={() => setRevision(value => value + 1)} className="rounded border px-3 py-2 text-sm">Actualiser</button>
      <label className="text-xs">Périmètre<select aria-label="Périmètre des retards" value={factory} onChange={event => setFactory(event.target.value)} className="block border rounded p-2"><option value="">Total (commandes distinctes)</option><option value="compare">Comparer les usines</option>{data?.factories.map(row => <option key={row.factory} value={row.factory}>{row.factory}</option>)}</select></label>
    </form>
    {loading ? <p role="status">Calcul des délais…</p> : error ? <p role="alert" className="text-red-600">{error}</p> : <>
      {(targets.production === "" || targets.expedition === "") && <p className="text-xs">Renseignez chaque délai cible pour afficher son taux de retard. Aucun seuil n’est imposé par défaut.</p>}
      <p className="text-xs">Taux = commandes terminées au-delà du délai cible ÷ commandes terminées avec dates vérifiables. Les commandes encore ouvertes dépassant le délai sont comptées séparément. Les dates historiques inconnues sont exclues du taux, pas assimilées à des commandes à l’heure.</p>
      {rows.some(row => row.production.rate !== null || row.expedition.rate !== null) && <div role="img" aria-label="Diagramme des taux de retard par usine ou total"><ResponsiveContainer width="100%" height={260}><BarChart data={rows.map(row => ({ name: row.factory, production: row.production.rate, expedition: row.expedition.rate }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis domain={[0, 100]} unit="%" /><Tooltip /><Legend /><Bar dataKey="production" name="Retard production (%)" fill="#f59e0b" /><Bar dataKey="expedition" name="Retard livraison (%)" fill="#3b82f6" /></BarChart></ResponsiveContainer></div>}
      <div className="overflow-auto"><table className="w-full text-xs"><caption className="text-left py-2">Délais depuis l’entrée de commande — détail vérifiable</caption><thead><tr><th>Périmètre</th><th>Étape</th><th>Taux retard</th><th>Retard / terminées datées</th><th>Durée moyenne</th><th>Ouvertes hors délai</th><th>Dates inconnues / incohérentes</th></tr></thead><tbody>{rows.flatMap(row => (["production", "expedition"] as const).map(stage => { const metric = row[stage]; const configured = stage === "production" ? targets.production !== "" : targets.expedition !== ""; return <tr key={`${row.factory}-${stage}`} className="border-t text-center"><td className="p-2">{row.factory}</td><td>{stage === "production" ? "Production complète" : "Livraison totale"}</td><td>{metric.rate === null ? "Non calculable" : `${metric.rate} %`}</td><td>{configured ? metric.late : "—"} / {metric.completed}</td><td>{metric.averageDays === null ? "—" : `${metric.averageDays} j`}</td><td>{configured ? metric.openLate : "—"}</td><td>{metric.unknown}</td></tr>; }))}</tbody></table></div>
      <p className="text-xs text-gray-500">Une commande multi-usines apparaît dans chaque usine concernée, mais une seule fois au total. Les dates de fin restent celles de la commande entière, pas celles du seul sous-ensemble usine. Les groupes ne doivent pas être additionnés.</p>
    </>}
  </section>;
}
