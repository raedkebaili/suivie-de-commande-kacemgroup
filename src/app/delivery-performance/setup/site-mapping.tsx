"use client";
import { useEffect, useState } from "react";
import Grants from "./grants";
type Factory = { id:number; code:string; name:string; active:boolean };
type Mapping = { factoryId:number; reportingCode:string };
export default function DpmSiteMapping() {
  const [factories,setFactories] = useState<Factory[]>([]);
  const [mappings,setMappings] = useState<Mapping[]>([]);
  const [factoryId,setFactoryId] = useState("");
  const [code,setCode] = useState("KER-01");
  const [reason,setReason] = useState("");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  async function load() {
    const res = await fetch("/api/dpm/setup"); const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Accès refusé");
    setFactories(data.factories); setMappings(data.mappings);
  }
  useEffect(() => { load().catch(e => setMessage(e.message)); },[]);
  return <main className="mx-auto max-w-3xl p-6 space-y-5">
    <h1 className="text-2xl font-bold">DPM — Rapprochement des sites</h1>
    <p>Aucune correspondance automatique. Le nom et le code historiques des usines restent inchangés. Cette opération n’accorde aucune habilitation industrielle et n’active pas les indicateurs.</p>
    <ul>{mappings.map(m => <li key={m.reportingCode}>{m.reportingCode} : {factories.find(f=>f.id===m.factoryId)?.name ?? `Usine #${m.factoryId}`}</li>)}</ul>
    <form className="flex flex-col gap-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMessage("");
      try {
        const res = await fetch("/api/dpm/setup", {method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({factoryId:Number(factoryId),reportingCode:code,reason})});
        const data = await res.json(); if (!res.ok) throw new Error(data.error);
        await load(); setFactoryId(""); setReason(""); setMessage("Correspondance enregistrée. Module toujours inactif.");
      } catch(e) { setMessage(e instanceof Error ? e.message : "Erreur"); } finally {setBusy(false);}
    }}>
      <label>Site de reporting<select className="block border p-2 w-full" value={code} onChange={e=>setCode(e.target.value)}>{["KER-01","KER-02","AGU-01","AGU-02"].map(c=><option key={c} disabled={mappings.some(m=>m.reportingCode===c)}>{c}</option>)}</select></label>
      <label>Usine existante<select required className="block border p-2 w-full" value={factoryId} onChange={e=>setFactoryId(e.target.value)}><option value="">Choisir explicitement une usine</option>{factories.filter(f=>f.active && !mappings.some(m=>m.factoryId===f.id)).map(f=><option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}</select></label>
      <label>Justification<textarea required maxLength={2000} className="block border p-2 w-full" value={reason} onChange={e=>setReason(e.target.value)} /></label>
      <button disabled={busy || mappings.some(m=>m.reportingCode===code)} className="rounded bg-blue-700 p-3 text-white disabled:opacity-50">Enregistrer la correspondance</button>
    </form><p role="status">{message}</p><Grants />
  </main>;
}
