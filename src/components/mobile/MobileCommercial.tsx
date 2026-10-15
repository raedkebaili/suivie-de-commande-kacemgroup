"use client";
import { useEffect, useState } from "react";
import { useMobileDraftProtection } from "@/lib/mobile-draft-context";
import { apiFetch } from "@/lib/api";
import type { Agency, Client, OrderItem, User } from "@/lib/types";
import { todayISO } from "@/lib/production-planning-constants";
import { commercialItemsPayload } from "@/lib/mobile-commercial";
import { Notice, btnGhost, btnPrimary, fieldClass } from "./ui";

export type CommercialOrder = { id: number; orderDate: string; clientId: number; agencyId: number; affaire: string | null; status: string; items: OrderItem[] };
export default function MobileCommercial({ user, order, onSaved, onCancel, onSessionExpired }: { user: User; order?: CommercialOrder; onSaved: (id: number) => void; onCancel: () => void; onSessionExpired: () => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [draft, setDraft] = useState({ orderDate: order?.orderDate?.slice(0, 10) || todayISO(), clientId: String(order?.clientId || ""), agencyId: String(order?.agencyId || ""), affaire: order?.affaire || "", status: order?.status || (user.role === "planification" ? "SUR_STOCK" : "PREVISION") });
  const [items, setItems] = useState<OrderItem[]>(order?.items.map((i) => ({ ...i })) || [{ articleName: "", quantity: 1 }]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [initialDraft] = useState(() => JSON.stringify({ draft, items }));
  useMobileDraftProtection(JSON.stringify({ draft, items }) !== initialDraft, busy);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    Promise.all([apiFetch<{ clients: Client[] }>("/api/clients"), apiFetch<{ agencies: Agency[] }>("/api/agencies")]).then(([c, a]) => { if (active) { setClients(c.clients); setAgencies(a.agencies); } }).catch((err: unknown) => {
      if (!active) return;
      const message = err instanceof Error ? err.message : "Chargement impossible";
      if (message === "Non authentifié") onSessionExpired(); else setError(message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onSessionExpired, retry]);
  const updateItem = (index: number, patch: Partial<OrderItem>) => setItems((rows) => rows.map((item, i) => i === index ? { ...item, ...patch } : item));
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const body = { ...draft, agencyId: draft.agencyId || undefined, items: commercialItemsPayload(items) };
      const data = await apiFetch<{ order: { id: number } }>(order ? `/api/orders/${order.id}` : "/api/orders", { method: order ? "PUT" : "POST", body: JSON.stringify(body) });
      onSaved(order?.id || data.order.id);
    } catch (err) { const message = err instanceof Error ? err.message : "Enregistrement impossible"; if (message === "Non authentifié") onSessionExpired(); else setError(message); }
    finally { setBusy(false); }
  };
  const cancel = () => { if (window.confirm("Quitter la saisie sans enregistrer ?")) onCancel(); };
  return <form onSubmit={save} className="space-y-4">
    <h1 className="text-lg font-bold">{order ? "Modifier la commande" : "Nouvelle commande"}</h1>
    {error && <Notice tone="error">{error}<button type="button" className={btnGhost} onClick={() => setRetry((n) => n + 1)}>Recharger les listes</button></Notice>}
    {loading && <p role="status">Chargement des listes…</p>}
    <fieldset disabled={busy || loading} className="space-y-4 min-w-0">
      <label className="block text-sm">Date<input required type="date" className={fieldClass} value={draft.orderDate} onChange={(e) => setDraft({ ...draft, orderDate: e.target.value })} /></label>
      <label className="block text-sm">Client<select required className={fieldClass} value={draft.clientId} onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}><option value="">Choisir un client</option>{clients.filter((c) => c.active !== false || c.id === Number(draft.clientId)).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
      <label className="block text-sm">État commercial<select className={fieldClass} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{[["PREVISION", "Prévision"], ["BON_COMMANDE", "Bon de commande"], ["SUR_STOCK", "Sur stock / besoin interne"]].filter(([key]) => user.role !== "planification" || key === "SUR_STOCK").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="block text-sm">Agence{draft.status === "SUR_STOCK" ? " (facultative)" : " *"}<select required={draft.status !== "SUR_STOCK"} className={fieldClass} value={draft.agencyId} onChange={(e) => setDraft({ ...draft, agencyId: e.target.value })}><option value="">{draft.status === "SUR_STOCK" ? "Agence interne automatique" : "Choisir une agence"}</option>{agencies.filter((a) => a.active !== false || a.id === Number(draft.agencyId)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="block text-sm">Affaire<input className={fieldClass} value={draft.affaire} onChange={(e) => setDraft({ ...draft, affaire: e.target.value })} /></label>
      {items.map((item, index) => <section key={index} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
        <h2 className="text-sm font-semibold">Article {index + 1}</h2>
        <label className="block text-sm">Désignation<input required className={fieldClass} value={item.articleName} onChange={(e) => updateItem(index, { articleName: e.target.value })} /></label>
        <label className="block text-sm">Quantité<input required type="number" min={Math.max(1, item.producedQty || 0, item.deliveredQty || 0)} step="1" className={fieldClass} value={item.quantity || ""} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} /></label>
        <label className="block text-sm">Prix unitaire<input type="number" min="0" step="0.001" className={fieldClass} value={item.unitPrice || ""} onChange={(e) => updateItem(index, { unitPrice: e.target.value })} /></label>
        <label className="block text-sm">Besoin client<textarea className={fieldClass} value={item.clientSpec || ""} onChange={(e) => updateItem(index, { clientSpec: e.target.value })} /></label>
        <label className="block text-sm">Note<textarea className={fieldClass} value={item.note || ""} onChange={(e) => updateItem(index, { note: e.target.value })} /></label>
        <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={!!item.isTelegestion} onChange={(e) => updateItem(index, { isTelegestion: e.target.checked })} />Télégestion</label>
        {!item.id && items.length > 1 && <button type="button" className={btnGhost} onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}>Retirer cet article</button>}
      </section>)}
      <button type="button" className={btnGhost} onClick={() => setItems((rows) => [...rows, { articleName: "", quantity: 1 }])}>Ajouter un article</button>
      {order && <Notice tone="info">Les articles existants sont conservés. Leur suppression reste disponible dans la version ordinateur.</Notice>}
      <button type="submit" className={btnPrimary} disabled={busy || !clients.length}>{busy ? "Enregistrement…" : "Enregistrer la commande"}</button>
    </fieldset>
    <button type="button" disabled={busy} className={`${btnGhost} w-full`} onClick={cancel}>Annuler</button>
  </form>;
}
