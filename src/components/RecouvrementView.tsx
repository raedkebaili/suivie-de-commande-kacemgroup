"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { RecouvrementState, User } from "@/lib/types";
import { RECOUVREMENT_TONES } from "@/lib/recouvrement-constants";
import { useColors } from "@/lib/color-context";
import { getContrastTextColor } from "@/lib/color-utils";
import { Plus, Save, Trash2, Palette, Info } from "lucide-react";

/**
 * Onglet « Recouvrement » — gestion du catalogue des états de recouvrement.
 * Accessible aux rôles superadmin + recouvrement (gating dans page.tsx,
 * contrôlé côté serveur par les routes /api/recouvrement/*).
 */
export default function RecouvrementView({ user: _ }: { user: User }) {
  const { getColor } = useColors();
  const [states, setStates] = useState<RecouvrementState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Formulaire de création
  const [showCreate, setShowCreate] = useState(false);
  const [nLabel, setNLabel] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nColor, setNColor] = useState(RECOUVREMENT_TONES[0].key);
  const [nOrder, setNOrder] = useState("200");
  const [saving, setSaving] = useState(false);

  // Édition en ligne
  const [editId, setEditId] = useState<number | null>(null);
  const [eLabel, setELabel] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eColor, setEColor] = useState("");
  const [eOrder, setEOrder] = useState("0");

  const fetchStates = useCallback(async () => {
    try {
      const data = await apiFetch<{ states: RecouvrementState[] }>("/api/recouvrement/states");
      setStates(data.states);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    }
  }, []);

  useEffect(() => { fetchStates().finally(() => setLoading(false)); }, [fetchStates]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(""), 4000); };

  const createState = async () => {
    if (!nLabel.trim()) { setError("Libellé requis"); return; }
    setSaving(true); setError("");
    try {
      await apiFetch("/api/recouvrement/states", {
        method: "POST",
        body: JSON.stringify({ label: nLabel.trim(), description: nDesc.trim(), colorKey: nColor, sortOrder: parseInt(nOrder) || 200 }),
      });
      setNLabel(""); setNDesc(""); setNOrder("200"); setShowCreate(false);
      flash("État créé avec succès");
      await fetchStates();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    finally { setSaving(false); }
  };

  const startEdit = (s: RecouvrementState) => {
    setEditId(s.id); setELabel(s.label); setEDesc(s.description || ""); setEColor(s.colorKey); setEOrder(String(s.sortOrder)); setError("");
  };

  const saveEdit = async () => {
    if (editId === null) return;
    setSaving(true); setError("");
    try {
      await apiFetch(`/api/recouvrement/states/${editId}`, {
        method: "PUT",
        body: JSON.stringify({ label: eLabel.trim(), description: eDesc.trim(), colorKey: eColor, sortOrder: parseInt(eOrder) || 0 }),
      });
      setEditId(null);
      flash("État mis à jour");
      await fetchStates();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    finally { setSaving(false); }
  };

  const toggleActive = async (s: RecouvrementState) => {
    try {
      await apiFetch(`/api/recouvrement/states/${s.id}`, { method: "PUT", body: JSON.stringify({ active: !s.active }) });
      await fetchStates();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  const remove = async (s: RecouvrementState) => {
    if (!confirm(`Supprimer l'état « ${s.label} » ?`)) return;
    setError("");
    try {
      await apiFetch(`/api/recouvrement/states/${s.id}`, { method: "DELETE" });
      flash("État supprimé");
      await fetchStates();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  const swatch = (colorKey: string, size = "w-5 h-5") => {
    const c = getColor(colorKey);
    return (
      <span
        className={`inline-block ${size} rounded-full border border-black/20 shrink-0`}
        style={{ backgroundColor: c }}
        title={`${colorKey} (${c})`}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">États de recouvrement</h3>
        <button onClick={() => { setShowCreate(v => !v); setError(""); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Nouvel état
        </button>
      </div>

      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Ces états sont attribuables aux clients depuis le tableau <b>Clients</b>. L&apos;état choisi déclenche une
          alerte visuelle (alternance de couleur entre le nom du client et son état). Les couleurs se personnalisent
          dans l&apos;onglet <b>Couleurs</b> de l&apos;administrateur système (catégorie « États de Recouvrement »).
        </p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {notice && <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">{notice}</div>}

      {showCreate && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h4 className="font-semibold text-sm text-gray-800 dark:text-white">Nouvel état de recouvrement</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Libellé *</label>
              <input type="text" value={nLabel} onChange={e => setNLabel(e.target.value)} placeholder="Ex: Relance 3"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ordre d&apos;affichage</label>
              <input type="number" value={nOrder} onChange={e => setNOrder(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
            <input type="text" value={nDesc} onChange={e => setNDesc(e.target.value)} placeholder="Description de l'état"
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1"><Palette className="w-3.5 h-3.5" /> Couleur</label>
            <div className="flex flex-wrap gap-2">
              {RECOUVREMENT_TONES.map(t => (
                <button key={t.key} type="button" onClick={() => setNColor(t.key)} title={t.label}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${nColor === t.key ? "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700 font-semibold" : "border-gray-300 dark:border-gray-600 hover:border-gray-400"} text-gray-700 dark:text-gray-200`}>
                  {swatch(t.key, "w-3.5 h-3.5")}{t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Annuler</button>
            <button onClick={createState} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "Création..." : "Créer"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Couleur</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">État</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Description</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Ordre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actif</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {states.map(s => {
                const editing = editId === s.id;
                const hex = getColor(editing ? eColor : s.colorKey);
                const txt = getContrastTextColor(hex);
                return (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 align-top">
                    <td className="px-4 py-3">
                      {editing ? (
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {RECOUVREMENT_TONES.map(t => (
                            <button key={t.key} type="button" onClick={() => setEColor(t.key)} title={t.label}
                              className={`rounded-full ${eColor === t.key ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900" : ""}`}>
                              {swatch(t.key, "w-4 h-4")}
                            </button>
                          ))}
                        </div>
                      ) : swatch(s.colorKey)}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input type="text" value={eLabel} onChange={e => setELabel(e.target.value)}
                          className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
                      ) : (
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: hex, color: txt }}>{s.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[280px]">
                      {editing ? (
                        <input type="text" value={eDesc} onChange={e => setEDesc(e.target.value)}
                          className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
                      ) : (s.description || "-")}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input type="number" value={eOrder} onChange={e => setEOrder(e.target.value)}
                          className="w-20 px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
                      ) : <span className="text-xs text-gray-500">{s.sortOrder}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(s)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${s.active ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                        {s.active ? "Actif" : "Inactif"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {editing ? (
                        <>
                          <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 inline-flex items-center gap-1 disabled:opacity-50">
                            <Save className="w-3.5 h-3.5" /> Enregistrer
                          </button>
                          <button onClick={() => setEditId(null)} className="ml-1 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200">Annuler</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(s)} className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100">Modifier</button>
                          <button onClick={() => remove(s)} title="Supprimer (refusé si attribué à un client)"
                            className="ml-1 px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 inline-flex items-center gap-1">
                            <Trash2 className="w-3.5 h-3.5" /> Suppr.
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
