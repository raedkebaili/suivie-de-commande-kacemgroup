"use client";
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

export default function UsersView({ user: _ }: { user: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(""); const [role, setRole] = useState("commercial");
  const [error, setError] = useState("");
  const fetch = useCallback(async () => { setUsers((await apiFetch<{ users: User[] }>("/api/users")).users); }, []);
  useEffect(() => { fetch().finally(() => setLoading(false)); }, [fetch]);
  const reset = () => { setUsername(""); setPassword(""); setFullName(""); setRole("commercial"); setEdit(null); setError(""); };
  const open = (u: User) => { setEdit(u); setUsername(u.username); setPassword(""); setFullName(u.fullName); setRole(u.role); setShow(true); };
  const save = async () => {
    try { if (!username || !fullName) { setError("Champs requis"); return; } if (!edit && !password) { setError("Mot de passe requis"); return; }
      const p: Record<string, unknown> = { username, fullName, role }; if (password) p.password = password;
      if (edit) await apiFetch(`/api/users/${edit.id}`, { method: "PUT", body: JSON.stringify(p) });
      else await apiFetch("/api/users", { method: "POST", body: JSON.stringify(p) });
      setShow(false); reset(); fetch(); } catch (err: unknown) { setError(err instanceof Error ? err.message : "Erreur"); }
  };
  const toggleActive = async (u: User) => { await apiFetch(`/api/users/${u.id}`, { method: "PUT", body: JSON.stringify({ active: !u.active }) }); fetch(); };
  const del = async (id: number) => { if (!confirm("Supprimer ?")) return; await apiFetch(`/api/users/${id}`, { method: "DELETE" }); fetch(); };

  const roleColor = (r: string) => r === "superadmin" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
    : r === "commercial" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
    : r === "technique" ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
    : r === "planification" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300";

  return <div className="space-y-4">
    <div className="flex justify-between"><h3 className="text-lg font-semibold text-gray-800 dark:text-white">Utilisateurs</h3><button onClick={() => { reset(); setShow(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Nouveau</button></div>
    {loading ? <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div> :
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Utilisateur</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nom complet</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Rôle</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Statut</th><th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {users.map(u => <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50"><td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{u.username}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.fullName}</td><td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleColor(u.role)}`}>{ROLE_LABELS[u.role] || u.role}</span></td><td className="px-4 py-3"><button onClick={() => toggleActive(u)} className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.active ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"}`}>{u.active ? "Actif" : "Inactif"}</button></td><td className="px-4 py-3 text-right"><button onClick={() => open(u)} className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100">Modifier</button><button onClick={() => del(u.id)} className="ml-1 px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100">Suppr.</button></td></tr>)}
      </tbody></table></div>}
    {show && <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={() => setShow(false)} /><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"><h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">{edit ? "Modifier" : "Nouvel Utilisateur"}</h4>{error && <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}<div className="space-y-3"><F label="Nom d'utilisateur *" value={username} onChange={setUsername} /><F label="Mot de passe" value={password} onChange={setPassword} type="password" placeholder={edit ? "Laisser vide" : ""} /><F label="Nom complet *" value={fullName} onChange={setFullName} /><div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Rôle *</label><select value={role} onChange={e => setRole(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200"><option value="superadmin">Super Admin</option><option value="commercial">Service Commercial</option><option value="technique">Service Technique</option><option value="planification">Service Planification</option><option value="consultant_prod">Consultant Prod</option><option value="recouvrement">Responsable Recouvrement</option></select></div></div><div className="flex justify-end gap-2 mt-6"><button onClick={() => setShow(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Annuler</button><button onClick={save} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{edit ? "Enregistrer" : "Créer"}</button></div></div></div>}
  </div>;
}
function F({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200" /></div>;
}
