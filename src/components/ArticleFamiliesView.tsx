"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { ARTICLE_FAMILY_STATUS, type ArticleFamilyStatus } from "@/lib/article-family";

type FamilyItem = {
  designation: string;
  status: ArticleFamilyStatus;
  familyKey: string | null;
  source: "MANUEL" | "AUTOMATIQUE" | null;
  category: string | null;
  catalogId: number | null;
  power: number | null;
  occurrences: number;
  orderCount: number;
  totalQuantity: number;
};

type CatalogItem = { id: number; category: string; subFamily: string; variant: string; label: string; designationCount: number };
type Summary = { designations: number; recognized: number; toClassify: number; manual: number; families: number; occurrences: number };
type CatalogDraft = { category: string; subFamily: string; variant: string };

const EMPTY_DRAFT: CatalogDraft = { category: "", subFamily: "", variant: "" };

/**
 * Onglet « Familles d'articles » — réservé au superadmin.
 * 1. Catalogue manuel : création, modification et suppression de familles
 *    (FAMILLE > SOUS FAMILLE > VARIANTE).
 * 2. Référentiel : chaque désignation originale, sa famille effective et son origine.
 *    L'administrateur peut affecter manuellement une désignation à une famille du catalogue,
 *    ou revenir à la classification automatique.
 * Aucune désignation ni aucune commande n'est modifiée par cette vue.
 */
export default function ArticleFamiliesView({ user }: { user: User }) {
  const [items, setItems] = useState<FamilyItem[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [draft, setDraft] = useState<CatalogDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<CatalogDraft>(EMPTY_DRAFT);

  const flash = (message: string) => { setNotice(message); setTimeout(() => setNotice(""), 4000); };

  const load = async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ items: FamilyItem[]; families: string[]; catalog: CatalogItem[]; summary: Summary }>("/api/admin/article-families");
      setItems(d.items);
      setFamilies(d.families);
      setCatalog(d.catalog);
      setSummary(d.summary);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /** Action d'écriture : verrouille les boutons, affiche l'erreur, recharge le référentiel */
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setError("");
    try {
      await action();
      flash(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const createFamily = () => run(async () => {
    await apiFetch("/api/admin/article-families/catalog", { method: "POST", body: JSON.stringify(draft) });
    setDraft(EMPTY_DRAFT);
  }, "Famille créée");

  const saveEdit = (id: number) => run(async () => {
    await apiFetch(`/api/admin/article-families/catalog/${id}`, { method: "PUT", body: JSON.stringify(editDraft) });
    setEditingId(null);
  }, "Famille modifiée");

  const deleteFamily = (entry: CatalogItem) => {
    const message = entry.designationCount > 0
      ? `Supprimer la famille « ${entry.label} » ? ${entry.designationCount} désignation(s) reviendront à la classification automatique. Les commandes ne sont pas modifiées.`
      : `Supprimer la famille « ${entry.label} » ?`;
    if (!window.confirm(message)) return;
    run(async () => {
      await apiFetch(`/api/admin/article-families/catalog/${entry.id}`, { method: "DELETE" });
    }, "Famille supprimée");
  };

  const assign = (designation: string, catalogId: number | null) => run(async () => {
    await apiFetch("/api/admin/article-families/assignments", { method: "PUT", body: JSON.stringify({ designation, catalogId }) });
  }, catalogId === null ? "Retour à la classification automatique" : "Désignation affectée");

  const categories = useMemo(() => [...new Set(catalog.map((c) => c.category))].sort((a, b) => a.localeCompare(b, "fr")), [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (familyFilter && i.familyKey !== familyFilter) return false;
      if (q && !i.designation.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, familyFilter]);

  const recognized = filtered.filter((i) => i.status === ARTICLE_FAMILY_STATUS.RECONNU);
  const toClassify = filtered.filter((i) => i.status === ARTICLE_FAMILY_STATUS.A_CLASSIFIER);

  const inputClass = "px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-700 dark:text-gray-200";

  const renderAssignSelect = (i: FamilyItem) => (
    <select value={i.catalogId ?? ""} disabled={busy}
      onChange={(e) => assign(i.designation, e.target.value ? parseInt(e.target.value) : null)}
      className={`${inputClass} max-w-[220px]`} aria-label={`Affecter ${i.designation}`}>
      <option value="">— automatique —</option>
      {categories.map((cat) => (
        <optgroup key={cat} label={cat}>
          {catalog.filter((c) => c.category === cat).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </optgroup>
      ))}
    </select>
  );

  const renderTable = (rows: FamilyItem[], emptyText: string, unclassified: boolean) => (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left">
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Désignation originale</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Famille</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Puissance</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Origine</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Affectation manuelle</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Commandes</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Occurrences</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Quantité totale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">{emptyText}</td></tr>
            )}
            {rows.map((i) => (
              <tr key={i.designation} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${unclassified ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}`}>
                <td className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-100">{i.designation || "(sans nom)"}</td>
                <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">
                  {i.familyKey ?? <span className="italic text-amber-700 dark:text-amber-400">À classifier</span>}
                  {i.category && <span className="block text-[10px] text-gray-400">{i.category}</span>}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{i.power !== null ? `${i.power} W` : "—"}</td>
                <td className="px-3 py-1.5">
                  {i.source === "MANUEL" && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">Manuel</span>}
                  {i.source === "AUTOMATIQUE" && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Automatique</span>}
                  {i.source === null && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">À classifier</span>}
                </td>
                <td className="px-3 py-1.5">{renderAssignSelect(i)}</td>
                <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{i.orderCount}</td>
                <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{i.occurrences}</td>
                <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{i.totalQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">🧩 Familles d&apos;articles</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Chaque désignation est rattachée à une famille automatiquement lorsque c&apos;est possible. Vous pouvez créer des familles
          dans le catalogue puis y affecter les désignations non reconnues. Une affectation manuelle prime sur la classification
          automatique. Les désignations des commandes ne sont jamais modifiées.
        </p>
        <p className="text-[11px] text-gray-400 mt-1">Connecté : {user.fullName}</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Désignations", value: summary.designations },
            { label: "Familles", value: summary.families },
            { label: "Reconnues", value: summary.recognized },
            { label: "Affectées à la main", value: summary.manual },
            { label: "À classifier", value: summary.toClassify },
            { label: "Occurrences", value: summary.occurrences },
          ].map((c) => (
            <div key={c.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{c.label}</div>
              <div className="text-xl font-bold text-gray-800 dark:text-white">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {notice && <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">{notice}</div>}

      {/* ── Catalogue des familles ── */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Catalogue des familles ({catalog.length})</h4>
        <form className="grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr_auto] gap-2 items-end"
          onSubmit={(e) => { e.preventDefault(); createFamily(); }}>
          <label className="text-[11px] text-gray-600 dark:text-gray-400">Famille
            <input list="article-family-categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={`${inputClass} w-full`} />
            <datalist id="article-family-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="text-[11px] text-gray-600 dark:text-gray-400">Sous-famille
            <input value={draft.subFamily} onChange={(e) => setDraft({ ...draft, subFamily: e.target.value })} className={`${inputClass} w-full`} />
          </label>
          <label className="text-[11px] text-gray-600 dark:text-gray-400">Variante (facultatif)
            <input value={draft.variant} onChange={(e) => setDraft({ ...draft, variant: e.target.value })} className={`${inputClass} w-full`} />
          </label>
          <button type="submit" disabled={busy} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50">+ Ajouter</button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                <th className="px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">Famille</th>
                <th className="px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">Sous-famille</th>
                <th className="px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">Variante</th>
                <th className="px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">Libellé de regroupement</th>
                <th className="px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300 text-right">Désignations</th>
                <th className="px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {catalog.map((c) => editingId === c.id ? (
                <tr key={c.id}>
                  <td className="px-2 py-1"><input value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} className={`${inputClass} w-full`} /></td>
                  <td className="px-2 py-1"><input value={editDraft.subFamily} onChange={(e) => setEditDraft({ ...editDraft, subFamily: e.target.value })} className={`${inputClass} w-full`} /></td>
                  <td className="px-2 py-1"><input value={editDraft.variant} onChange={(e) => setEditDraft({ ...editDraft, variant: e.target.value })} className={`${inputClass} w-full`} /></td>
                  <td className="px-2 py-1 text-gray-400">—</td>
                  <td className="px-2 py-1 text-right">{c.designationCount}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button onClick={() => saveEdit(c.id)} disabled={busy} className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] disabled:opacity-50">Enregistrer</button>
                    <button onClick={() => setEditingId(null)} className="ml-1 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-[11px]">Annuler</button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200">{c.category}</td>
                  <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200">{c.subFamily}</td>
                  <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300">{c.variant || "—"}</td>
                  <td className="px-2 py-1.5 font-semibold text-gray-800 dark:text-gray-100">{c.label}</td>
                  <td className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-300">{c.designationCount}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button onClick={() => { setEditingId(c.id); setEditDraft({ category: c.category, subFamily: c.subFamily, variant: c.variant }); }}
                      disabled={busy} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-[11px] disabled:opacity-50">Modifier</button>
                    <button onClick={() => deleteFamily(c)} disabled={busy} className="ml-1 px-2 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-[11px] disabled:opacity-50">Supprimer</button>
                  </td>
                </tr>
              ))}
              {catalog.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-400">Aucune famille dans le catalogue.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Filtres ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800 flex items-center gap-2 flex-wrap">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Rechercher une désignation..."
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-72 text-gray-700 dark:text-gray-200" />
        <select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)}
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
          <option value="">Toutes les familles</option>
          {families.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={load} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200">🔄 Actualiser</button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Chargement...</div>
      ) : (
        <>
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">À classifier ({toClassify.length})</h4>
          {renderTable(toClassify, "Aucune désignation à classifier.", true)}
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Familles reconnues ({recognized.length})</h4>
          {renderTable(recognized, "Aucune désignation reconnue pour ce filtre.", false)}
        </>
      )}
    </div>
  );
}
