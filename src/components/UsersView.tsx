"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import type { Agency, User } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

export default function UsersView({ user: _ }: { user: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(""); const [role, setRole] = useState("commercial");
  const [agencies, setAgencies] = useState<Agency[]>([]); const [agencyIds, setAgencyIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const fetch = useCallback(async () => {
    const [usersData, agenciesData] = await Promise.all([
      apiFetch<{ users: User[] }>("/api/users"),
      apiFetch<{ agencies: Agency[] }>("/api/agencies"),
    ]);
    setUsers(usersData.users); setAgencies(agenciesData.agencies);
  }, []);
  useEffect(() => { fetch().finally(() => setLoading(false)); }, [fetch]);
  const reset = () => { setUsername(""); setPassword(""); setFullName(""); setRole("commercial"); setAgencyIds([]); setEdit(null); setError(""); };
  const open = (u: User) => { setEdit(u); setUsername(u.username); setPassword(""); setFullName(u.fullName); setRole(u.role); setAgencyIds(u.agencyIds || []); setShow(true); };
  const save = async () => {
    try { if (!username || !fullName) { setError("Champs requis"); return; } if (!edit && !password) { setError("Mot de passe requis"); return; }
      const p: Record<string, unknown> = { username, fullName, role, agencyIds }; if (password) p.password = password;
      if (edit) await apiFetch(`/api/users/${edit.id}`, { method: "PUT", body: JSON.stringify(p) });
      else await apiFetch("/api/users", { method: "POST", body: JSON.stringify(p) });
      setShow(false); reset(); fetch(); } catch (err: unknown) { setError(err instanceof Error ? err.message : "Erreur"); }
  };
  const toggleActive = async (u: User) => { await apiFetch(`/api/users/${u.id}`, { method: "PUT", body: JSON.stringify({ active: !u.active }) }); fetch(); };
  const del = async (id: number) => { if (!confirm("Supprimer ?")) return; await apiFetch(`/api/users/${id}`, { method: "DELETE" }); fetch(); };
  const importUsers = async () => {
    const file = importRef.current?.files?.[0];
    if (!file) { setImportMessage("Sélectionnez un fichier Excel."); return; }
    setImporting(true); setImportMessage("");
    const formData = new FormData(); formData.append("file", file);
    try {
      const result = await apiFetch<{ imported: number; created: number; updated: number }>("/api/users/import", { method: "POST", body: formData });
      setImportMessage(`${result.imported} utilisateur(s) importé(s) : ${result.created} créé(s), ${result.updated} mis à jour.`);
      if (importRef.current) importRef.current.value = "";
      await fetch();
    } catch (err: unknown) {
      setImportMessage(err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally { setImporting(false); }
  };
  const deleteAllUsers = async () => {
    if (!confirm("Supprimer toute la liste des utilisateurs ? Le compte administrateur connecté sera conservé.")) return;
    const confirmation = prompt("Pour confirmer, saisissez : SUPPRIMER TOUS LES AUTRES UTILISATEURS");
    if (confirmation?.trim() !== "SUPPRIMER TOUS LES AUTRES UTILISATEURS") return;
    try {
      const result = await apiFetch<{ deleted: number }>("/api/users", { method: "DELETE", body: JSON.stringify({ confirmation }) });
      setImportMessage(`${result.deleted} utilisateur(s) supprimé(s). Le compte administrateur connecté a été conservé.`);
      await fetch();
    } catch (err: unknown) {
      setImportMessage(err instanceof Error ? err.message : "Erreur lors de la suppression.");
    }
  };

  const roleColor = (r: string) => r === "superadmin" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
    : r === "commercial" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
    : r === "technique" ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
    : r === "planification" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
    : r === "gerant" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300";

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold text-gray-800 dark:text-white">Utilisateurs</h3><div className="flex flex-wrap items-center gap-2"><input ref={importRef} type="file" accept=".xlsx,.xls" onChange={() => setImportMessage("")} className="hidden" /><button onClick={() => importRef.current?.click()} disabled={importing} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-60">📥 Choisir Excel</button><button onClick={importUsers} disabled={importing} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-60">{importing ? "Import en cours…" : "Importer les utilisateurs"}</button><button onClick={deleteAllUsers} className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">🗑 Supprimer toute la liste</button><button onClick={() => { reset(); setShow(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Nouveau</button></div></div>
    <p className="text-xs text-gray-500 dark:text-gray-400">Excel attendu : <b>Utilisateur</b>, <b>Nom complet</b>, <b>Rôle</b>, <b>Mot de passe</b>. Pour « Accès agence », ajoutez la colonne <b>Agence(s)</b> ou indiquez l’agence entre parenthèses dans le rôle.</p>
    {importMessage && <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">{importMessage}</div>}
    {loading ? <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div> :
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Utilisateur</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nom complet</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Rôle</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Statut</th><th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {users.map(u => <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50"><td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{u.username}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.fullName}</td><td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleColor(u.role)}`}>{ROLE_LABELS[u.role] || u.role}</span></td><td className="px-4 py-3"><button onClick={() => toggleActive(u)} className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.active ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"}`}>{u.active ? "Actif" : "Inactif"}</button></td><td className="px-4 py-3 text-right"><button onClick={() => open(u)} className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100">Modifier</button><button onClick={() => del(u.id)} className="ml-1 px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100">Suppr.</button></td></tr>)}
      </tbody></table></div>}
    {show && <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={() => setShow(false)} /><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"><h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">{edit ? "Modifier" : "Nouvel Utilisateur"}</h4>{error && <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}<div className="space-y-3"><F label="Nom d'utilisateur *" value={username} onChange={setUsername} /><F label="Mot de passe" value={password} onChange={setPassword} type="password" placeholder={edit ? "Laisser vide" : ""} /><F label="Nom complet *" value={fullName} onChange={setFullName} /><div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Rôle *</label><select value={role} onChange={e => { const nextRole = e.target.value; setRole(nextRole); if (nextRole !== "acces_agence") setAgencyIds([]); }} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200"><option value="superadmin">Super Admin</option><option value="commercial">Service Commercial</option><option value="technique">Service Technique</option><option value="planification">Service Planification</option><option value="consultant_prod">Consultant Prod</option><option value="recouvrement">Recouvrement</option><option value="acces_agence">Accès agence (consultation)</option><option value="gerant">Gérant (consultation étendue)</option></select></div>{role === "acces_agence" && <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Agences visibles *</label><p className="text-[10px] text-gray-500 mb-2">Ce rôle peut uniquement consulter les commandes et études des agences cochées.</p><div className="max-h-32 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-700 p-2 space-y-1">{agencies.filter(a=>a.active).map(agency=><label key={agency.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200"><input type="checkbox" checked={agencyIds.includes(agency.id)} onChange={event=>setAgencyIds(current=>event.target.checked?[...current,agency.id]:current.filter(id=>id!==agency.id))} className="accent-blue-600" />{agency.name} ({agency.code})</label>)}{agencies.filter(a=>a.active).length===0&&<span className="text-xs text-gray-400">Aucune agence active</span>}</div></div>}</div><div className="flex justify-end gap-2 mt-6"><button onClick={() => setShow(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Annuler</button><button onClick={save} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{edit ? "Enregistrer" : "Créer"}</button></div></div></div>}
  </div>;
}
function F({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200" /></div>;
}
