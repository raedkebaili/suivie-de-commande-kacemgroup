"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { PLANNING_STATUSES, planningStatusLabel, todayISO } from "@/lib/production-planning-constants";
import { canManageMobilePlanning, mobilePlanningQuantity, planningTransitionWarning } from "@/lib/mobile-planning";
import { Notice, Row, btnGhost, btnPrimary, fieldClass } from "./ui";

type Plan = { planDate: string; id: number; itemId: number; orderId: number; orderNumber: string | null; articleName: string; clientName: string | null; plannedQty: number; status: string; reason?: string | null; note?: string | null; driverName?: string; factoryName?: string | null; appliedAt?: string | null; appliedQty?: number; loadedQty?: number; itemQuantity?: number; itemProducedQty?: number; itemDeliveredQty?: number };
const EXPEDITION_STATUSES = [{ key: "NON_TRAITE", label: "Non traité" }, { key: "EN_COURS", label: "En cours" }, { key: "LIVRE", label: "Livré" }, { key: "ANNULE", label: "Annulé" }];

function PlanCard({ plan, kind, canManage, onOpen, onReload, onSessionExpired }: { plan: Plan; kind: "production" | "expedition"; canManage: boolean; onOpen: (id: number) => void; onReload: () => void; onSessionExpired: () => void }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(plan.status);
  const [qty, setQty] = useState(String(plan.plannedQty));
  const [reason, setReason] = useState(plan.reason || plan.note || "");
  const [planDate, setPlanDate] = useState(plan.planDate);
  const [driverName, setDriverName] = useState(plan.driverName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const applied = !!plan.appliedAt || (plan.loadedQty || 0) > 0 || plan.status === "LIVRE";
  const statuses = kind === "production" ? PLANNING_STATUSES : EXPEDITION_STATUSES;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const warning = status !== plan.status ? planningTransitionWarning(status) : null;
    if (warning && !window.confirm(warning)) return;
    setBusy(true);
    try {
      const plannedQty = mobilePlanningQuantity(qty);
      if (kind === "production" && ["SUSPENDU", "ANNULE"].includes(status) && !reason.trim()) throw new Error("Un motif est requis pour ce statut.");
      await apiFetch(`/api/${kind}-planning/${plan.id}`, { method: "PUT", body: JSON.stringify({ status, ...(plannedQty !== plan.plannedQty && !applied ? { plannedQty } : {}), ...(kind === "production" ? { reason } : { note: reason, planDate, driverName: driverName.trim() }) }) });
      setEditing(false); onReload();
    } catch (err) { const message = err instanceof Error ? err.message : "Enregistrement impossible"; if (message === "Non authentifié") onSessionExpired(); else setError(message); }
    finally { setBusy(false); }
  };
  return <li className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 space-y-2">
    <h2 className="text-sm font-bold break-words">{plan.articleName}</h2>
    <p className="text-sm">{plan.orderNumber} · {plan.clientName}</p>
    <Row label="État" value={kind === "production" ? planningStatusLabel(plan.status) : EXPEDITION_STATUSES.find((s) => s.key === plan.status)?.label || plan.status} />
    <Row label="Quantité planifiée" value={plan.plannedQty} />
    <Row label={kind === "production" ? "Usine" : "Chauffeur"} value={plan.factoryName || plan.driverName} />
    <Row label="Produit / livré" value={`${plan.itemProducedQty || 0} / ${plan.itemDeliveredQty || 0}`} />
    {(plan.reason || plan.note) && <p className="text-sm break-words">{plan.reason || plan.note}</p>}
    {applied && <Notice tone="info">Quantité déjà appliquée : {plan.appliedQty || plan.loadedQty || plan.plannedQty}. Ligne en consultation sur mobile.</Notice>}
    <button type="button" className={btnGhost} onClick={() => onOpen(plan.orderId)}>Voir la commande</button>
    {canManage && !applied && !editing && <button type="button" className={btnGhost} onClick={() => { setStatus(plan.status); setQty(String(plan.plannedQty)); setReason(plan.reason || plan.note || ""); setPlanDate(plan.planDate); setDriverName(plan.driverName || ""); setEditing(true); }}>Modifier la ligne</button>}
    {editing && <form onSubmit={save} className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">État<select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        {kind === "expedition" && <>
          <label className="block text-sm">Date de chargement<input required type="date" className={fieldClass} value={planDate} onChange={(e) => setPlanDate(e.target.value)} /></label>
          <label className="block text-sm">Chauffeur / porteur<input required className={fieldClass} value={driverName} onChange={(e) => setDriverName(e.target.value)} /></label>
        </>}
        <label className="block text-sm">Quantité<input required type="number" min="1" step="1" className={fieldClass} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label className="block text-sm">{kind === "production" ? "Motif" : "Note"}<textarea className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="submit" className={btnPrimary}>{busy ? "Enregistrement…" : "Enregistrer la ligne"}</button>
        <button type="button" className={btnGhost} onClick={() => setEditing(false)}>Annuler</button>
      </fieldset>
    </form>}
  </li>;
}

export default function MobilePlanning({ kind, user, onOpenOrder, onSessionExpired }: { kind: "production" | "expedition"; user: User; onOpenOrder: (id: number) => void; onSessionExpired: () => void }) {
  const [date, setDate] = useState(todayISO);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [visible, setVisible] = useState(30);
  useEffect(() => {
    let active = true; setLoading(true); setError(""); setPlans([]);
    apiFetch<{ entries?: Plan[]; plans?: Plan[] }>(`/api/${kind}-planning?date=${encodeURIComponent(date)}`).then((data) => { if (active) setPlans(data.entries || data.plans || []); }).catch((err: unknown) => {
      if (!active) return;
      const message = err instanceof Error ? err.message : "Chargement impossible";
      if (message === "Non authentifié") onSessionExpired(); else setError(message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, date, revision, onSessionExpired]);
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = plans.filter((p) => normalize([p.articleName, p.orderNumber, p.clientName, p.factoryName, p.driverName].join(" ")).includes(normalize(query.trim())));
  return <div className="space-y-4">
    <h1 className="text-lg font-bold">Planning {kind === "production" ? "production" : "d’expédition"}</h1>
    <Notice tone="info">Ajoutez des articles au planning depuis leur fiche commande. Les quantités réelles sont appliquées lors de la validation de fin de production ou de livraison.</Notice>
    <label className="block text-sm">Journée<input type="date" required className={fieldClass} value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setVisible(30); } }} /></label>
    <input type="search" aria-label="Rechercher dans le planning" placeholder="Article, commande, client, usine, chauffeur…" className={fieldClass} value={query} onChange={(e) => { setQuery(e.target.value); setVisible(30); }} />
    <button className={btnGhost} disabled={loading} onClick={() => setRevision((n) => n + 1)}>Actualiser</button>
    {error && <Notice tone="error">{error}</Notice>}
    {loading && <p role="status">Chargement…</p>}
    {!loading && !error && filtered.length === 0 && <Notice tone="info">Aucune ligne pour cette journée et ces critères.</Notice>}
    <ul className="space-y-3">{filtered.slice(0, visible).map((plan) => <PlanCard key={`${plan.id}-${revision}`} plan={plan} kind={kind} canManage={canManageMobilePlanning(user.role)} onOpen={onOpenOrder} onReload={() => setRevision((n) => n + 1)} onSessionExpired={onSessionExpired} />)}</ul>
    {filtered.length > visible && <button className={`${btnGhost} w-full`} onClick={() => setVisible((n) => n + 30)}>Afficher plus</button>}
  </div>;
}
