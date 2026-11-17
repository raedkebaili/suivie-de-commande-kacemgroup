"use client";
import { useEffect, useState } from "react";
type Data={users:{id:number;fullName:string;active:boolean}[];sites:{factoryId:number;reportingCode:string}[];grants:{id:number;userId:number;factoryId:number|null;capability:string;active:boolean}[];capabilities:string[]};
export default function Grants() {
 const [data,setData]=useState<Data>(); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/dpm/grants'); const d=await r.json(); if(!r.ok)throw new Error(d.error);setData(d);}
 useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);
 return <section className="space-y-4 border-t pt-6"><h2 className="text-xl font-bold">Habilitations par utilisateur et site</h2><p>Chaque fonction est indépendante. Un rôle existant ne confère aucune approbation industrielle.</p>
 <form className="grid gap-3" onSubmit={async e=>{e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);try{const r=await fetch('/api/dpm/grants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:Number(f.get('userId')),factoryId:Number(f.get('factoryId')),capability:f.get('capability'),active:f.get('operation')==='grant',reason:f.get('reason')})});const d=await r.json();if(!r.ok)throw new Error(d.error);await load();setMessage('Habilitation enregistrée et journalisée.');}catch(e){setMessage(e instanceof Error?e.message:'Erreur');}finally{setBusy(false);}}}>
 <label>Utilisateur<select required name="userId" className="block border p-2 w-full"><option value="">Choisir</option>{data?.users.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.fullName}</option>)}</select></label>
 <label>Site<select required name="factoryId" className="block border p-2 w-full"><option value="">Choisir</option>{data?.sites.map(s=><option key={s.factoryId} value={s.factoryId}>{s.reportingCode}</option>)}</select></label>
 <label>Fonction<select required name="capability" className="block border p-2 w-full">{data?.capabilities.map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Opération<select name="operation" className="block border p-2"><option value="grant">Accorder</option><option value="revoke">Révoquer</option></select></label>
 <label>Motif<textarea required name="reason" maxLength={2000} className="block border p-2 w-full" /></label><button disabled={busy||!data} className="bg-blue-700 text-white rounded p-3 disabled:opacity-50">Enregistrer</button></form>
 <ul>{data?.grants.map(g=><li key={g.id}>{data.users.find(u=>u.id===g.userId)?.fullName} — {data.sites.find(s=>s.factoryId===g.factoryId)?.reportingCode??'Global explicite'} — {g.capability} : {g.active?'actif':'révoqué'}</li>)}</ul><p role="status">{message}</p></section>;
}
