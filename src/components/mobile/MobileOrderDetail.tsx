"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useColors } from "@/lib/color-context";
import { priorityLabel, PRIORITY_OPTIONS } from "@/lib/priority";
import { canEditPlanningOnMobile, mobilePlanningStateOptions, MOBILE_PRODUCTION_STATES } from "@/lib/mobile-orders";
import type { User } from "@/lib/types";
import { Notice, Row, Section, StatePill, btnGhost, btnPrimary, fieldClass, fmtDay } from "@/components/mobile/ui";

type DetailItem = {
  id: number;
  articleName: string;
  quantity: number;
  producedQty?: number | null;
  deliveredQty?: number | null;
  productionUnit?: string | null;
  plannedLoadingDate?: string | null;
  note?: string | null;
};

type OrderDetail = {
  id: number;
  orderNumber: string;
  orderDate: string;
  priority: string;
  status: string;
  productionStatus: string | null;
  statusReason: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  affaire: string | null;
  clientName: string | null;
  agencyName: string | null;
  items: DetailItem[];
};

const COMMERCIAL_LABELS: Record<string, string> = {
  BON_COMMANDE: "Bon de commande",
  PREVISION: "Prévision",
  SUR_STOCK: "Sur stock / besoin interne",
};

/** Fiche commande : sections claires ; formulaire de planification pour les rôles autorisés */
export default function MobileOrderDetail({ orderId, user, onBack, onSessionExpired }: { orderId: number; user: User; onBack: () => void; onSessionExpired: () => void }) {
  const { getBadgeStyle, colors } = useColors();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  // Brouillon du formulaire de planification
  const [draft, setDraft] = useState({ priority: "NORMALE", productionStatus: "EN_INSTANCE", statusReason: "", cancelReason: "" });

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ order: OrderDetail }>(`/api/orders/${orderId}`);
      setOrder(d.order);
      setDraft({
        priority: d.order.priority || "NORMALE",
        productionStatus: d.order.productionStatus || "EN_INSTANCE",
        statusReason: d.order.statusReason || "",
        cancelReason: d.order.cancelReason || "",
      });
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de chargement";
      if (message === "Non authentifié") { onSessionExpired(); return; }
      setError(message);
    }
  }, [orderId, onSessionExpired]);

  useEffect(() => { load(); }, [load]);

  const canPlan = canEditPlanningOnMobile(user.role);
  const planningOptions = mobilePlanningStateOptions(user.role);
  const currentState = order?.productionStatus || "EN_INSTANCE";
  // Un état déjà soldé dans un planning reste visible, sans être proposé
  const showCurrentLocked = !!order && !planningOptions.some((o) => o.value === currentState);
  const commercialLabel = (key: string) => COMMERCIAL_LABELS[key] || colors.find((c) => c.key === key)?.label || key;

  const save = async () => {
    if (!order) return;
    setSaving(true); setError(""); setSaved("");
    try {
      await apiFetch(`/api/orders/${order.id}`, {
        method: "PUT",
        body: JSON.stringify({
          priority: draft.priority,
          productionStatus: draft.productionStatus,
          statusReason: draft.statusReason || null,
          cancelReason: draft.productionStatus === "ANNULEE" ? (draft.cancelReason || null) : null,
        }),
      });
      setSaved("Enregistré.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enregistrement impossible";
      if (message === "Non authentifié") { onSessionExpired(); return; }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className={btnGhost}>← Retour</button>
        <button onClick={load} className={btnGhost}>🔄</button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {saved && <Notice tone="success">{saved}</Notice>}
      {!order && !error && <div className="py-10 text-center text-sm text-slate-500">Chargement…</div>}

      {order && (
        <>
          <div className="rounded-2xl bg-slate-900 text-white p-4">
            <div className="text-xs text-slate-300">Commande</div>
            <div className="font-mono text-xl font-bold">{order.orderNumber}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatePill style={getBadgeStyle(currentState)}>{MOBILE_PRODUCTION_STATES.find((s) => s.value === currentState)?.label || currentState}</StatePill>
              <StatePill style={getBadgeStyle(order.status)}>{commercialLabel(order.status)}</StatePill>
            </div>
          </div>

          <Section title="Informations">
            <Row label="Date" value={fmtDay(order.orderDate)} />
            <Row label="Client" value={order.clientName} />
            <Row label="Agence" value={order.agencyName} />
            <Row label="Affaire" value={order.affaire} />
          </Section>

          <Section title="Priorité et état">
            <Row label="Priorité" value={priorityLabel(order.priority)} />
            <Row label="Motif du changement" value={order.statusReason} />
            {currentState === "ANNULEE" && (
              <>
                <Row label="Cause d'annulation" value={order.cancelReason} />
                <Row label="Annulée par" value={order.cancelledBy} />
                <Row label="Le" value={fmtDay(order.cancelledAt)} />
              </>
            )}
          </Section>

          <Section title={`Articles (${order.items.length})`}>
            {order.items.length === 0 && <p className="text-sm text-slate-500">Aucun article.</p>}
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {order.items.map((it) => (
                <li key={it.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="font-medium text-sm break-words">{it.articleName}</div>
                  <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span>Commandé <b className="text-slate-900 dark:text-white">{it.quantity}</b></span>
                    <span>Produit <b className="text-slate-900 dark:text-white">{it.producedQty ?? 0}</b></span>
                    <span>Livré <b className="text-slate-900 dark:text-white">{it.deliveredQty ?? 0}</b></span>
                  </div>
                  {(it.productionUnit || it.plannedLoadingDate) && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {it.productionUnit && <>Usine : {it.productionUnit}</>}
                      {it.productionUnit && it.plannedLoadingDate && " · "}
                      {it.plannedLoadingDate && <>Chargement prévu : {fmtDay(it.plannedLoadingDate)}</>}
                    </div>
                  )}
                  {it.note && <div className="mt-1 text-xs italic text-slate-500">{it.note}</div>}
                </li>
              ))}
            </ul>
          </Section>

          {canPlan ? (
            <Section title="Planification">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium">Priorité</span>
                  <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} className={`${fieldClass} mt-1`}>
                    {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium">État</span>
                  <select value={draft.productionStatus} onChange={(e) => setDraft({ ...draft, productionStatus: e.target.value })} className={`${fieldClass} mt-1`}>
                    {showCurrentLocked && <option value={currentState} disabled>{MOBILE_PRODUCTION_STATES.find((s) => s.value === currentState)?.label} (soldée dans le planning)</option>}
                    {planningOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
                {showCurrentLocked && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    « En production » et « Livrée » se soldent dans le planning de production ou d&apos;expédition (version ordinateur).
                  </p>
                )}

                <label className="block">
                  <span className="text-sm font-medium">Motif du changement</span>
                  <input value={draft.statusReason} onChange={(e) => setDraft({ ...draft, statusReason: e.target.value })} className={`${fieldClass} mt-1`} maxLength={500} />
                </label>

                {draft.productionStatus === "ANNULEE" && (
                  <label className="block">
                    <span className="text-sm font-medium">Cause d&apos;annulation</span>
                    <textarea value={draft.cancelReason} onChange={(e) => setDraft({ ...draft, cancelReason: e.target.value })} rows={3} maxLength={500} className="w-full mt-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-base" />
                  </label>
                )}

                <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
              </div>
            </Section>
          ) : (
            <Notice tone="info">Les modifications de cette commande se font depuis la version ordinateur.</Notice>
          )}
        </>
      )}
    </div>
  );
}
