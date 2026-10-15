"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { OrderItem } from "@/lib/types";
import { todayISO } from "@/lib/production-planning-constants";
import { expeditionAvailable, mobilePlanningQuantity } from "@/lib/mobile-planning";
import { Notice, btnGhost, btnPrimary, fieldClass } from "./ui";

type Factory = { id: number; name: string; active: boolean };
export default function MobilePlanCreate({ item, onSessionExpired }: { item: OrderItem & { id: number }; onSessionExpired: () => void }) {
  const [kind, setKind] = useState<"production" | "expedition" | null>(null);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState("");
  const [date, setDate] = useState(todayISO);
  const [quantity, setQuantity] = useState("");
  const [driver, setDriver] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (kind !== "production") return;
    let active = true; setLoading(true); setError("");
    apiFetch<{ factories: Factory[] }>("/api/factories").then((data) => { if (active) setFactories(data.factories.filter((f) => f.active)); }).catch((err: unknown) => {
      if (!active) return;
      const message = err instanceof Error ? err.message : "Usines indisponibles";
      if (message === "Non authentifié") onSessionExpired(); else setError(message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, retry, onSessionExpired]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const qty = mobilePlanningQuantity(quantity);
      if (kind === "expedition" && qty > expeditionAvailable(item.producedQty, item.deliveredQty)) throw new Error("Quantité supérieure au stock produit disponible.");
      if (kind === "production") {
        const data = await apiFetch<{ created: unknown[]; skipped: { reason: string }[] }>("/api/production-planning", { method: "POST", body: JSON.stringify({ date, factoryId: Number(factoryId), entries: [{ itemId: item.id, plannedQty: qty }] }) });
        if (!data.created.length) throw new Error(data.skipped.map((s) => s.reason).join(" · ") || "Aucune ligne créée.");
      } else {
        await apiFetch("/api/expedition-planning", { method: "POST", body: JSON.stringify({ planDate: date, itemId: item.id, plannedQty: qty, driverName: driver.trim(), note }) });
      }
      setKind(null); setSuccess("Article ajouté au planning. Retrouvez-le dans Plus → Plannings.");
    } catch (err) { const message = err instanceof Error ? err.message : "Planification impossible"; if (message === "Non authentifié") onSessionExpired(); else setError(message); }
    finally { setBusy(false); }
  };
  return <div className="mt-3 space-y-3">
    {success && <Notice tone="success">{success}</Notice>}
    {!kind ? <div className="flex flex-wrap gap-2"><button type="button" className={btnGhost} onClick={() => { setKind("production"); setError(""); setSuccess(""); setQuantity(String(Math.max(1, item.quantity - (item.producedQty || 0)))); }}>Planifier la production</button><button type="button" className={btnGhost} disabled={expeditionAvailable(item.producedQty, item.deliveredQty) <= 0} onClick={() => { setKind("expedition"); setError(""); setSuccess(""); setQuantity(String(expeditionAvailable(item.producedQty, item.deliveredQty))); }}>Planifier l’expédition</button></div> : <form onSubmit={create} className="space-y-3 border rounded-xl p-3">
      <h3 className="font-semibold text-sm">Planifier : {kind === "production" ? "production" : "expédition"}</h3>
      {error && <Notice tone="error">{error}{kind === "production" && <button type="button" className={btnGhost} onClick={() => setRetry((n) => n + 1)}>Recharger les usines</button>}</Notice>}
      <fieldset disabled={busy || loading} className="space-y-3">
        <label className="block text-sm">Date<input type="date" required className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="block text-sm">Quantité<input type="number" min="1" step="1" max={kind === "expedition" ? expeditionAvailable(item.producedQty, item.deliveredQty) : undefined} required className={fieldClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
        {kind === "production" ? <label className="block text-sm">Usine<select required className={fieldClass} value={factoryId} onChange={(e) => setFactoryId(e.target.value)}><option value="">Choisir une usine</option>{factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label> : <>
          <label className="block text-sm">Chauffeur / porteur<input required className={fieldClass} value={driver} onChange={(e) => setDriver(e.target.value)} /></label>
          <label className="block text-sm">Note<textarea className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </>}
        <button type="submit" className={btnPrimary}>{busy ? "Enregistrement…" : "Ajouter au planning"}</button>
      </fieldset>
      {loading && <p role="status">Chargement des usines…</p>}
      <button type="button" disabled={busy} className={btnGhost} onClick={() => setKind(null)}>Annuler</button>
    </form>}
  </div>;
}
