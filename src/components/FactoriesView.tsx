"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

type Factory = {
  id: number; code: string; name: string;
  responsableId: number | null; responsableName: string | null;
  active: boolean; createdAt: string;
};

/**
 * Onglet « Usines » — unités de production.
 * Chaque usine dispose de son propre planning de production.
 * Le responsable est obligatoirement un utilisateur de la plateforme.
 */
export default function FactoriesView({ user }: { user: User }) {
  const canManage = user.role === "superadmin" || user.role === "planification";

  const [items, setItems] = useState<Factory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Factory | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [saving, setSaving] = useState(false);

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(""), 4000); };

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ factories: Factory[] }>("/api/factories");
      setItems(d.factories);
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    finally { setLoading(false); }
  }, []);

  const loadUsers = useCallback(async () => {
    // Liste minimale dédiée au choix du responsable (route /api/factories/users),
    // accessible au superadmin ET au planificateur. /api/users reste inchangée.
    try {
      const d = await apiFetch<{ users: User[] }>("/api/factories/users");
      setUsers(d.users);
    } catch { /* accès restreint : sélection limitée */ }
  }, []);

  useEffect(() => { load(); loadUsers(); }, [load, loadUsers]);

  const reset = () => { setCode(""); setName(""); setResponsableId(""); setEdit(null); setError(""); };
  const open = (f: Factory) => {
    setEdit(f); setCode(f.code); setName(f.name);
    setResponsableId(f.responsableId ? String(f.responsableId) : ""); setError(""); setShow(true);
  };

  const save = async () => {
    if (!code.trim() || !name.trim()) { setError("Code et nom requis"); return; }
    if (!responsableId) { setError("Le responsable d'usine est obligatoire"); return; }
    setSaving(true); setError("");
    try {
      const payload = { code: code.trim(), name: name.trim(), responsableId: parseInt(responsableId) };
      if (edit) await apiFetch(`/api/factories/${edit.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await apiFetch("/api/factories", { method: "POST", body: JSON.stringify(payload) });
      setShow(false); reset(); flash(edit ? "Usine mise à jour" : "Usine créée");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    finally { setSaving(false); }
  };

  const toggleActive = async (f: Factory) => {
    try {
      await apiFetch(`/api/factories/${f.id}`, { method: "PUT", body: JSON.stringify({ active: !f.active }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  const remove = async (f: Factory) => {
    if (!confirm(`Supprimer l'usine « ${f.name} » ?`)) return;
    setError("");
    try {
      await apiFetch(`/api/factories/${f.id}`, { method: "DELETE" });
      flash("Usine supprimée"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">🏭 Usines</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Unités de production. Chaque usine dispose de son propre planning de production.
          </p>
        </div>
        {canManage && (
          <button onClick={() => { reset(); setShow(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            + Nouvelle usine
          </button>
        )}
      </div>

      {error && !show && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {notice && <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">{notice}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 py-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucune usine enregistrée.</p>
          {canManage && <p className="text-xs text-gray-400 mt-1">Créez vos usines pour pouvoir planifier la production.</p>}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Code</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nom de l&apos;usine</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Responsable</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Statut</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{f.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{f.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{f.responsableName || <span className="text-gray-400 italic">—</span>}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => canManage && toggleActive(f)} disabled={!canManage}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${f.active ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"} ${canManage ? "" : "cursor-default"}`}>
                      {f.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canManage && <>
                      <button onClick={() => open(f)} className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100">Modifier</button>
                      <button onClick={() => remove(f)} className="ml-1 px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100">Suppr.</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {show && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShow(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">{edit ? "Modifier l'usine" : "Nouvelle usine"}</h4>
            {error && <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Code usine *</label>
                <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ex : US01"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nom de l&apos;usine *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Usine Sfax"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
                <p className="text-[10px] text-gray-500 mt-1">Ce nom s&apos;affiche comme unité de production dans le tableau des commandes.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Responsable d&apos;usine *</label>
                <select value={responsableId} onChange={e => setResponsableId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200">
                  <option value="">— Sélectionner un utilisateur —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.fullName} ({ROLE_LABELS[u.role] || u.role})</option>)}
                  {/* Conserve le responsable actuel même si la liste n'a pas pu être chargée */}
                  {edit?.responsableId && !users.some(u => u.id === edit.responsableId) && (
                    <option value={edit.responsableId}>{edit.responsableName}</option>
                  )}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">Obligatoirement un utilisateur de la plateforme.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShow(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Annuler</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "…" : edit ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
