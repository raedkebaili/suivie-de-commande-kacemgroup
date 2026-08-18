"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import type { Client, User } from "@/lib/types";

export default function ClientsView({ user }: { user: User }) {
  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Client | null>(null);
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [contact, setContact] = useState("");
  const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const canDel = user.role === "superadmin";
  const fetch = useCallback(async () => { setItems((await apiFetch<{ clients: Client[] }>("/api/clients")).clients); }, []);
  useEffect(() => { fetch().finally(() => setLoading(false)); }, [fetch]);
  const reset = () => { setName(""); setCode(""); setContact(""); setPhone(""); setEmail(""); setAddress(""); setEdit(null); setError(""); };
  const open = (c: Client) => { setEdit(c); setName(c.name); setCode(c.code); setContact(c.contactName || ""); setPhone(c.phone || ""); setEmail(c.email || ""); setAddress(c.address || ""); setShow(true); };
  const save = async () => {
    try { if (!name || !code) { setError("Nom et code requis"); return; }
      const payload = { name, code, contactName: contact, phone, email, address };
      if (edit) { await apiFetch(`/api/clients/${edit.id}`, { method: "PUT", body: JSON.stringify(payload) }); }
      else { await apiFetch("/api/clients", { method: "POST", body: JSON.stringify(payload) }); }
      setShow(false); reset(); fetch(); } catch (err: unknown) { setError(err instanceof Error ? err.message : "Erreur"); }
  };
  const del = async (id: number) => { if (!confirm("Supprimer ?")) return; await apiFetch(`/api/clients/${id}`, { method: "DELETE" }); fetch(); };
  const delAll = async () => { if (!confirm("Supprimer TOUS les clients ?")) return; const r = await apiFetch<{deleted:number}>("/api/clients", { method: "DELETE" }); alert(`${r.deleted} clients supprimés`); fetch(); };
  const importFile = async () => {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file); fd.append("type", "clients");
    try { const r = await apiFetch<{ imported: number }>("/api/import", { method: "POST", body: fd }); setImportMsg(`${r.imported} clients importés !`); fetch(); } catch (err: unknown) { setImportMsg(err instanceof Error ? err.message : "Erreur"); }
  };
  const downloadModel = () => window.open("/api/templates?type=clients", "_blank");

  const filtered = searchQ.length >= 2
    ? items.filter(c => c.name.toLowerCase().includes(searchQ.toLowerCase()) || c.code.toLowerCase().includes(searchQ.toLowerCase()) || (c.contactName||"").toLowerCase().includes(searchQ.toLowerCase()) || (c.address||"").toLowerCase().includes(searchQ.toLowerCase()))
    : items;

  const highlight = (t: string) => {
    if (searchQ.length < 2) return t;
    const idx = t.toLowerCase().indexOf(searchQ.toLowerCase());
    if (idx < 0) return t;
    return <>{t.slice(0, idx)}<mark className="bg-yellow-300 dark:bg-yellow-500 text-black px-0.5 rounded">{t.slice(idx, idx + searchQ.length)}</mark>{t.slice(idx + searchQ.length)}</>;
  };

  return <div className="space-y-4">
    <div className="flex justify-between items-center"><h3 className="text-lg font-semibold text-gray-800 dark:text-white">Clients</h3><div className="flex gap-2">{canDel && <button onClick={delAll} className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">🗑️ Tout supprimer</button>}<button onClick={() => { reset(); setShow(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Nouveau</button></div></div>
    <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800 flex-wrap">
      <button onClick={downloadModel} className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300">📥 Modèle Excel</button>
      <input type="file" accept=".xlsx,.xls" ref={fileRef} className="text-sm" />
      <button onClick={importFile} className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700">📥 Importer</button>
      {importMsg && <span className="text-xs text-green-600">{importMsg}</span>}
      <div className="flex-1" />
      <input type="text" placeholder="🔍 Rechercher client..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
        className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-56 text-gray-700 dark:text-gray-200" />
    </div>
    {loading ? <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div> :
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Code</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nom</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Contact</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Tél</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Email</th><th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Adresse</th><th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {filtered.map(c => <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50"><td className="px-4 py-3 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">{highlight(c.code)}</td><td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{highlight(c.name)}</td><td className="px-4 py-3 text-gray-500">{highlight(c.contactName || "-")}</td><td className="px-4 py-3 text-gray-500">{c.phone || "-"}</td><td className="px-4 py-3 text-gray-500">{c.email || "-"}</td><td className="px-4 py-3 text-gray-500 text-xs">{highlight(c.address || "-")}</td><td className="px-4 py-3 text-right"><button onClick={() => open(c)} className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100">Modifier</button>{canDel && <button onClick={() => del(c.id)} className="ml-1 px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100">Suppr.</button>}</td></tr>)}
      </tbody></table></div>}
    {show && <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={() => setShow(false)} /><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"><h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">{edit ? "Modifier" : "Nouveau Client"}</h4>{error && <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}<div className="space-y-3"><F label="Code *" value={code} onChange={v => setCode(v.toUpperCase())} /><F label="Nom *" value={name} onChange={setName} /><F label="Contact" value={contact} onChange={setContact} /><div className="grid grid-cols-2 gap-3"><F label="Téléphone" value={phone} onChange={setPhone} /><F label="Email" value={email} onChange={setEmail} /></div><F label="Adresse" value={address} onChange={setAddress} /></div><div className="flex justify-end gap-2 mt-6"><button onClick={() => setShow(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Annuler</button><button onClick={save} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{edit ? "Enregistrer" : "Créer"}</button></div></div></div>}
  </div>;
}
function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label><input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200" /></div>;
}
