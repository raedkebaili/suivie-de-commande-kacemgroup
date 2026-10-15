"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { orderModalSaveRights } from "@/lib/order-modal-permissions";
import { mobileMaterialIds, mobileTechnicalPayload } from "@/lib/mobile-technical";
import { filterMobileDirectory } from "@/lib/mobile-navigation";
import type { Material, MaterialCategory, OrderItem, User } from "@/lib/types";
import { Notice, Row, btnGhost, btnPrimary, fieldClass, fmtDay } from "./ui";

const LEGACY_FIELDS = [
  ["pcb", "PCB"], ["colorTemperature", "Température de couleur"], ["lens", "Lentille"],
  ["driver", "Driver"], ["electricalClass", "Classe électrique"], ["accessories", "Accessoires"], ["otherTechSpecs", "Autres spécifications"],
] as const;

export default function MobileTechnicalItem({ item, orderId, user, onSaved, onSessionExpired }: {
  item: OrderItem & { id: number }; orderId: number; user: User;
  onSaved: () => Promise<void>; onSessionExpired: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [retry, setRetry] = useState(0);
  const canEdit = orderModalSaveRights(user.role, true).canSaveTechnical;
  const components = item.technicalComponents || [];

  useEffect(() => {
    if (!editing || !canEdit) return;
    let active = true;
    setLoading(true); setCatalogReady(false); setError("");
    Promise.all([
      apiFetch<{ matieres: Material[] }>("/api/matieres"),
      apiFetch<{ categories: MaterialCategory[] }>("/api/material-categories"),
    ]).then(([m, c]) => {
      if (active) { setMaterials(m.matieres); setCategories(c.categories); setCatalogReady(true); }
    }).catch((err: unknown) => {
      if (!active) return;
      const message = err instanceof Error ? err.message : "Catalogue indisponible";
      if (message === "Non authentifié") onSessionExpired(); else setError(message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editing, canEdit, onSessionExpired, retry]);

  const startEditing = () => {
    setSelected(mobileMaterialIds(components)); setQuery(""); setCategory(""); setSuccess(""); setEditing(true);
  };
  const save = async () => {
    setSaving(true); setError(""); setSuccess("");
    try {
      await apiFetch(`/api/orders/${orderId}`, { method: "PUT", body: JSON.stringify(mobileTechnicalPayload(item.id, selected)) });
      setEditing(false);
      setSuccess("Composants enregistrés.");
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enregistrement impossible";
      if (message === "Non authentifié") onSessionExpired(); else setError(message);
    } finally { setSaving(false); }
  };

  const activeCategoryIds = new Set(categories.filter((c) => c.active).map((c) => c.id));
  const available = materials.filter((m) => m.active !== false && m.categoryId !== null && activeCategoryIds.has(m.categoryId));
  const filtered = filterMobileDirectory(available.map((m) => ({ ...m, code: m.reference })), query)
    .filter((m) => !category || m.categoryId === Number(category));

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-700">
      <h3 className="text-sm font-semibold">Spécifications techniques</h3>
      {components.length === 0 && !LEGACY_FIELDS.some(([key]) => item[key]) && <p className="text-xs text-slate-500 dark:text-slate-400">Aucune spécification renseignée.</p>}
      {LEGACY_FIELDS.map(([key, label]) => item[key] ? <Row key={key} label={label} value={item[key]} /> : null)}
      {components.map((c) => (
        <div key={c.id} className="text-sm break-words">
          <p><b>{c.categoryName}</b> : {c.materialReference} — {c.materialLabel}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{c.enteredByName} · {fmtDay(c.enteredAt)}</p>
        </div>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {canEdit && !editing && <button type="button" className={btnGhost} onClick={startEditing}>Modifier les composants</button>}
      {canEdit && editing && (
        <fieldset disabled={saving} className="space-y-3 min-w-0">
          <legend className="text-sm font-medium">Composants de {item.articleName}</legend>
          <Notice tone="info">Seuls les composants de cet article seront modifiés. Les anciennes spécifications textuelles restent inchangées.</Notice>
          {loading ? <p role="status">Chargement du catalogue…</p> : <>
            <p className="text-sm">{selected.length} composant(s) sélectionné(s)</p>
            {/* Garder visibles les sélections, même si la matière est inactive ou hors recherche. */}
            {selected.map((id) => {
              const material = materials.find((m) => m.id === id);
              const existing = components.find((c) => c.materialId === id);
              return <div key={id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 break-words">{material ? `${material.reference} — ${material.name}` : existing ? `${existing.materialReference} — ${existing.materialLabel}` : `Matière ${id}`}</span>
                <button type="button" className={btnGhost} aria-label={`Retirer ${material?.reference || existing?.materialReference || id}`} onClick={() => setSelected((ids) => ids.filter((value) => value !== id))}>Retirer</button>
              </div>;
            })}
            <label className="block text-sm">Catégorie
              <select className={`${fieldClass} mt-1`} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Toutes les catégories</option>
                {categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">Rechercher une matière
              <input type="search" className={`${fieldClass} mt-1`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Référence ou libellé" />
            </label>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
              {filtered.slice(0, 50).map((m) => <label key={m.id} className="flex min-h-[48px] items-center gap-3 p-3 text-sm break-words">
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={selected.includes(m.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...new Set([...ids, m.id])] : ids.filter((id) => id !== m.id))} />
                <span>{m.reference} — {m.name}</span>
              </label>)}
              {filtered.length === 0 && <p className="p-3 text-sm">Aucune matière disponible.</p>}
            </div>
            {filtered.length > 50 && <p className="text-xs">50 résultats affichés sur {filtered.length}. Affinez la recherche.</p>}
          </>}
          {error && <button type="button" className={btnGhost} onClick={() => setRetry((n) => n + 1)}>Recharger le catalogue</button>}
          <button type="button" className={btnPrimary} disabled={loading || saving || !catalogReady} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer les composants"}</button>
          <button type="button" className={`${btnGhost} w-full`} onClick={() => { setEditing(false); setError(""); }}>Annuler</button>
        </fieldset>
      )}
    </div>
  );
}
