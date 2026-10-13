"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { ARTICLE_FAMILY_STATUS, type ArticleFamilyStatus } from "@/lib/article-family";

type FamilyItem = {
  designation: string;
  status: ArticleFamilyStatus;
  family: string | null;
  generation: string | null;
  power: number | null;
  familyKey: string | null;
  occurrences: number;
  orderCount: number;
  totalQuantity: number;
};

type Summary = { designations: number; recognized: number; toClassify: number; families: number; occurrences: number };

/**
 * Onglet « Familles d'articles » — référentiel automatique (lecture seule).
 * Liste chaque désignation originale avec sa famille, sa puissance et son état.
 * Les articles non reconnus sont affichés séparément, sans famille attribuée.
 * Réservé au superadmin (contrôlé côté serveur par /api/admin/article-families).
 */
export default function ArticleFamiliesView({ user }: { user: User }) {
  const [items, setItems] = useState<FamilyItem[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ items: FamilyItem[]; families: string[]; summary: Summary }>("/api/admin/article-families");
      setItems(d.items);
      setFamilies(d.families);
      setSummary(d.summary);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const renderTable = (rows: FamilyItem[], emptyText: string, unclassified: boolean) => (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left">
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Désignation originale</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Famille</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Génération</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Puissance</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">État</th>
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
                <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">{i.family ?? <span className="italic text-amber-700 dark:text-amber-400">Non attribuée</span>}</td>
                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{i.generation ?? "—"}</td>
                <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{i.power !== null ? `${i.power} W` : "—"}</td>
                <td className="px-3 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${unclassified ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"}`}>
                    {unclassified ? "À classifier" : "Reconnu"}
                  </span>
                </td>
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
          Référentiel automatique : chaque désignation est rattachée à une famille commerciale, une génération et une puissance
          lorsqu&apos;elles sont identifiables. Les désignations non reconnues restent telles quelles, marquées « À classifier ».
          Cette vue est en lecture seule : les désignations des commandes ne sont pas modifiées.
        </p>
        <p className="text-[11px] text-gray-400 mt-1">Connecté : {user.fullName}</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Désignations", value: summary.designations },
            { label: "Familles", value: summary.families },
            { label: "Reconnues", value: summary.recognized },
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

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}

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
