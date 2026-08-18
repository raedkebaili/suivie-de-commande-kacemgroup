"use client";
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { Agency, User } from "@/lib/types";

export default function AgenciesView({ user }: { user: User }) {
  const [items, setItems] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Agency | null>(null);
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const canDel = user.role === "superadmin";
  const fetch = useCallback(async () => { setItems((await apiFetch<{ agencies: Agency[] }>("/api/agencies")).agencies); }, []);
  useEffect(() => { fetch().finally(() => setLoading(false)); }, [fetch]);
  const reset = () => { setName(""); setCode(""); setAddress(""); setEdit(null); setError(""); };
  const open = (a: Agency) => { setEdit(a); setName(a.name); setCode(a.code); setAddress(a.address || ""); setShow(true); };
  const save = async () => {
    try { if (!name || !code) { setError("Nom et code requis"); return; }
      if (edit) { await apiFetch(`/api/agencies/${edit.id}`, { method: "PUT", body: JSON.stringify({ name, code, address }) }); }
      else { await apiFetch("/api/agencies", { method: "POST", body: JSON.stringify({ name, code, address }) }); }
      setShow(false); reset(); fetch(); } catch (err: unknown) { setError(err instanceof Error ? err.message : "Erreur"); }
  };
  const del = async (id: number) => { if (!confirm("Supprimer ?")) return; await apiFetch(`/api/agencies/${id}`, { method: "DELETE" }); fetch(); };
  return <div className="space-y-4">
    <div className="flex justify-between"><h3 className="text-lg font-semibold text-gray-800 dark:text-white">Agences</h3><button onClick={() => { reset(); setShow(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Nouvelle</button></div>
    {loading ? <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div> :
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Code</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nom</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Adresse</th><th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {items.map(a => <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50"><td className="px-4 py-3 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{a.code}</td><td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{a.name}</td><td className="px-4 py-3 text-gray-500">{a.address || "-"}</td><td className="px-4 py-3 text-right"><button onClick={() => open(a)} className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100">Modifier</button>{canDel && <button onClick={() => del(a.id)} className="ml-1 px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100">Suppr.</button>}</td></tr>)}
      </tbody></table></div>}
    {show && <Modal title={edit ? "Modifier" : "Nouvelle Agence"} onClose={() => setShow(false)} error={error} onSave={save} saveLabel={edit ? "Enregistrer" : "Créer"}>
      <div className="space-y-3"><F label="Code *" value={code} onChange={v => setCode(v.toUpperCase())} /><F label="Nom *" value={name} onChange={setName} /><F label="Adresse" value={address} onChange={setAddress} /></div></Modal>}
  </div>;
}
function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label><input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200" /></div>;
}
function Modal({ title, onClose, error, onSave, saveLabel, children }: { title: string; onClose: () => void; error: string; onSave: () => void; saveLabel: string; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={onClose} /><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"><h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">{title}</h4>{error && <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}{children}<div className="flex justify-end gap-2 mt-6"><button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Annuler</button><button onClick={onSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{saveLabel}</button></div></div></div>;
}
