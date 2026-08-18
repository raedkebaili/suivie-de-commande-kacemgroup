"use client";
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { apiFetch, getToken } from "@/lib/api";
import type { Order, OrderItem, Agency, Client, User, ExpeditionBatch, MaterialCategory, Material } from "@/lib/types";
import AutocompleteInput from "@/components/AutocompleteInput";
import CategoryMaterialSelect from "@/components/CategoryMaterialSelect";
import { PRIORITY_LABELS } from "@/lib/types";
import { getOrderVisualState, ORDER_STATE_LABELS, ORDER_STATE_PANEL_CLASSES, ORDER_STATE_ROW_CLASSES, OrderVisualState } from "@/lib/order-visual-state";
import { useColors } from "@/lib/color-context";
import OrderItemRow from "@/components/OrderItemRow";

type FullOrder = Order & { totalQty?: number; totalDelivered?: number; totalProduced?: number; totalRemaining?: number };

type SortField = "date" | "alpha" | "number";
type SortDir = "asc" | "desc";

// Extract the leading numeric part of an order number like "12-2026" -> 12.
// Falls back to +Infinity so unparsable numbers sort last regardless of direction intent.
function orderNumericPart(orderNumber: string | undefined): number {
  const m = /^(\d+)/.exec(orderNumber || "");
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

function fmtDate(d: string): string { if (!d || d.startsWith("(datetime")) return new Date().toLocaleString("fr-FR"); try { const dt = new Date(d); if (!isNaN(dt.getTime())) return dt.toLocaleString("fr-FR"); } catch {} const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(d); if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`; return d?.substring(0,16)||""; }

export default function OrdersView({ user }: { user: User }) {
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<FullOrder | null>(null);
  const [fs, setFs] = useState(""); const [fa, setFa] = useState(""); const [fp, setFp] = useState("");
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [showImport, setShowImport] = useState(false); const [importType, setImportType] = useState("clients");
  const [watchLive, setWatchLive] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [importMsg, setImportMsg] = useState(""); const fileRef = useRef<HTMLInputElement>(null);
  const [showExpHistory, setShowExpHistory] = useState(false);
  const [expItemId, setExpItemId] = useState<number | null>(null);
  const [expBatches, setExpBatches] = useState<ExpeditionBatch[]>([]);
  const [showModHistory, setShowModHistory] = useState(false);
  const [modLogs, setModLogs] = useState<{id:number;username:string;field:string;oldValue:string|null;newValue:string|null;createdAt:string}[]>([]);
  const [modOrderId, setModOrderId] = useState<number|null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [form, setForm] = useState({ orderNumber:"", orderDate:new Date().toISOString().split("T")[0], priority:"NORMALE" as string, clientId:"", agencyId:"", affaire:"", commercialStatus:"PREVISION" as string, productionStatus:"EN_INSTANCE" as string, cancelReason:"", statusReason:"" });
  const [formItems, setFormItems] = useState<OrderItem[]>([]);
  const [techItems, setTechItems] = useState<Record<number, Record<string,string>>>({});
  const [materialCategories, setMaterialCategories] = useState<MaterialCategory[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [itemMaterialSelections, setItemMaterialSelections] = useState<Record<number, number[]>>({});
  const [openTelegestionItem, setOpenTelegestionItem] = useState<number | null>(null);
  const [itemProdUnits, setItemProdUnits] = useState<Record<number, string>>({});
  const [itemLoadingDates, setItemLoadingDates] = useState<Record<number, string>>({});
  
  // Cache des modifications par commande: Map<orderId, Map<articleName, Set<fieldType>>>
  const [orderModificationsCache, setOrderModificationsCache] = useState<Map<number, Map<string, Set<string>>>>(new Map());
  
  // Études photométriques
  type PhotoStudyItem = { id?: number; productName: string; lensId: string; lensReference?: string | null; lensLabel?: string | null; note: string };
  type PhotoStudy = { id: number; studyNumber: string; affaireName: string | null; orderId: number | null; clientId: number | null; clientName: string | null; note: string | null; createdByName: string; createdAt: string; items: PhotoStudyItem[] };
  const [showPhotoStudyModal, setShowPhotoStudyModal] = useState(false);
  const [photoStudyMode, setPhotoStudyMode] = useState<"order" | "standalone">("order");
  const [photoStudyForm, setPhotoStudyForm] = useState({ id: "", orderId: "", clientId: "", affaireName: "", studyNumber: "", note: "" });
  const [photoStudyItems, setPhotoStudyItems] = useState<PhotoStudyItem[]>([{ productName: "", lensId: "", note: "" }]);
  const [photoStudySaving, setPhotoStudySaving] = useState(false);
  const [editingStudy, setEditingStudy] = useState<PhotoStudy | null>(null);
  const [orderStudies, setOrderStudies] = useState<Map<number, PhotoStudy[]>>(new Map());
  const [standaloneStudies, setStandaloneStudies] = useState<PhotoStudy[]>([]);
  
  // Hook pour les couleurs
  const { getModifiedCellStyle, getColor } = useColors();

  const ce=()=>["superadmin","commercial"].includes(user.role), ct=()=>["superadmin","technique"].includes(user.role), cp=()=>["superadmin","planification"].includes(user.role), cd=user.role==="superadmin";

  const fetchOrders = useCallback(async()=>{const p=new URLSearchParams();if(fs)p.set("status",fs);if(fa)p.set("agencyId",fa);if(fp)p.set("priority",fp);setOrders((await apiFetch<{orders:FullOrder[]}>(`/api/orders?${p}`)).orders)},[fs,fa,fp]);
  useEffect(()=>{setLoading(true);Promise.all([
    fetchOrders(),
    apiFetch<{agencies:Agency[]}>("/api/agencies").then(d=>setAgencies(d.agencies)).catch(()=>{}),
    apiFetch<{clients:Client[]}>("/api/clients").then(d=>setClients(d.clients)).catch(()=>{}),
    apiFetch<{categories:MaterialCategory[]}>("/api/material-categories").then(d=>setMaterialCategories(d.categories.filter(category=>category.active))).catch(()=>{}),
    apiFetch<{matieres:Material[]}>("/api/matieres").then(d=>setMaterials(d.matieres)).catch(()=>{}),
  ]).finally(()=>setLoading(false))},[fetchOrders]);
  // Watch live auto-refresh
  useEffect(()=>{if(!watchLive)return;const iv=setInterval(fetchOrders,10000);return()=>clearInterval(iv)},[watchLive,fetchOrders]);
  // Auto-expand on search
  useEffect(()=>{if(searchTerm.length<2)return;const ids=new Set<number>();orders.forEach(o=>{if((o.orderNumber||"").toLowerCase().includes(searchTerm.toLowerCase())||(o.affaire||"").toLowerCase().includes(searchTerm.toLowerCase())||(o.clientName||"").toLowerCase().includes(searchTerm.toLowerCase())||(o.items||[]).some(i=>i.articleName.toLowerCase().includes(searchTerm.toLowerCase())))ids.add(o.id)});if(ids.size>0)setExpandedOrders(ids)},[searchTerm,orders]);

  // Charger les modifications d'une commande
  const loadOrderModifications = useCallback(async (orderId: number) => {
    if (orderModificationsCache.has(orderId)) return;
    try {
      const data = await apiFetch<{ logs: { field: string; oldValue: string | null; newValue: string | null }[] }>(`/api/order-modifications/${orderId}`);
      const articleModifications = new Map<string, Set<string>>();
      for (const log of data.logs) {
        const field = log.field;
        if (field === "Article renommé" && log.newValue) {
          if (!articleModifications.has(log.newValue)) articleModifications.set(log.newValue, new Set());
          articleModifications.get(log.newValue)!.add("articleName");
        } else if (field === "Article ajouté" && log.newValue) {
          if (!articleModifications.has(log.newValue)) articleModifications.set(log.newValue, new Set());
          articleModifications.get(log.newValue)!.add("added");
        } else if (field.startsWith("Qté ")) {
          const articleName = field.substring(4);
          if (!articleModifications.has(articleName)) articleModifications.set(articleName, new Set());
          articleModifications.get(articleName)!.add("quantity");
        } else if (field.startsWith("Note ")) {
          const articleName = field.substring(5);
          if (!articleModifications.has(articleName)) articleModifications.set(articleName, new Set());
          articleModifications.get(articleName)!.add("note");
        } else if (field.startsWith("Besoin ")) {
          const articleName = field.substring(7);
          if (!articleModifications.has(articleName)) articleModifications.set(articleName, new Set());
          articleModifications.get(articleName)!.add("clientSpec");
        } else if (field.startsWith("Composant ajouté - ") || field.startsWith("Composant supprimé - ")) {
          const articleName = field.split(" - ").slice(1).join(" - ");
          if (articleName) {
            if (!articleModifications.has(articleName)) articleModifications.set(articleName, new Set());
            articleModifications.get(articleName)!.add("technicalComponents");
          }
        }
      }
      setOrderModificationsCache(prev => new Map(prev).set(orderId, articleModifications));
    } catch (err) {
      console.error("Erreur chargement modifications:", err);
    }
  }, [orderModificationsCache]);

  const toggleExpand = (id: number) => {
    const s = new Set(expandedOrders);
    if (s.has(id)) {
      s.delete(id);
    } else {
      s.add(id);
      // Charger les modifications si pas encore en cache
      if (!orderModificationsCache.has(id)) loadOrderModifications(id);
      // Charger les études photométriques
      if (!orderStudies.has(id)) loadStudiesForOrder(id);
    }
    setExpandedOrders(s);
  };

  // Sort a copy of the fetched orders client-side based on the selected field/direction.
  const sortedOrders = useMemo(() => {
    const arr = [...orders];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortField === "alpha") {
        return dir * (a.orderNumber || "").localeCompare(b.orderNumber || "", "fr", { numeric: true, sensitivity: "base" });
      }
      if (sortField === "number") {
        return dir * (orderNumericPart(a.orderNumber) - orderNumericPart(b.orderNumber));
      }
      // date
      const da = new Date(a.orderDate || a.createdAt || 0).getTime();
      const db = new Date(b.orderDate || b.createdAt || 0).getTime();
      return dir * (da - db);
    });
    return arr;
  }, [orders, sortField, sortDir]);

  // Empiler / Dépiler toutes les commandes en un clic.
  const allExpanded = sortedOrders.length > 0 && sortedOrders.every(o => expandedOrders.has(o.id));
  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedOrders(new Set());
    } else {
      const allIds = new Set(sortedOrders.map(o => o.id));
      setExpandedOrders(allIds);
      // Charger les modifications et études pour toutes les commandes pas encore en cache
      for (const o of sortedOrders) {
        if (!orderModificationsCache.has(o.id)) loadOrderModifications(o.id);
        if (!orderStudies.has(o.id)) loadStudiesForOrder(o.id);
      }
    }
  };

  const rf=async()=>{try{const n=await apiFetch<{orderNumber:string}>("/api/orders/next-number");setForm({orderNumber:n.orderNumber,orderDate:new Date().toISOString().split("T")[0],priority:"NORMALE",clientId:"",agencyId:"",affaire:"",commercialStatus:"PREVISION",productionStatus:"EN_INSTANCE",cancelReason:"",statusReason:""})}catch{setForm({orderNumber:"",orderDate:new Date().toISOString().split("T")[0],priority:"NORMALE",clientId:"",agencyId:"",affaire:"",commercialStatus:"PREVISION",productionStatus:"EN_INSTANCE",cancelReason:"",statusReason:""})};setFormItems([]);setTechItems({});setItemMaterialSelections({});setOpenTelegestionItem(null);setEditingOrder(null);setError("");setSaving(false)};

  // Electron keyboard shortcuts (dispatched from page.tsx as custom DOM events):
  // F2 = Nouvelle commande, F5 = Actualiser. No-op in a regular browser tab.
  useEffect(() => {
    const onNewOrder = () => { if (ce()) { rf(); setShowModal(true); } };
    const onRefresh = () => { fetchOrders(); };
    window.addEventListener("shortcut:new-order", onNewOrder);
    window.addEventListener("shortcut:refresh", onRefresh);
    return () => {
      window.removeEventListener("shortcut:new-order", onNewOrder);
      window.removeEventListener("shortcut:refresh", onRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrders]);
  const oe=async(o:FullOrder)=>{
    // Always fetch fresh data from API to get latest items + tech specs
    const fresh = await apiFetch<{order:FullOrder}>(`/api/orders/${o.id}`);
    const order = fresh.order;
    setEditingOrder(order);
    const prodStatus = order.productionStatus || "EN_INSTANCE";
    setForm({orderNumber:order.orderNumber,orderDate:order.orderDate,priority:order.priority,clientId:String(order.clientId),agencyId:String(order.agencyId),affaire:order.affaire||"",commercialStatus:order.status||"PREVISION",productionStatus:order.productionStatus||"EN_INSTANCE",cancelReason:order.cancelReason||"",statusReason:order.statusReason||""});
    setFormItems(order.items&&order.items.length>0?order.items.map(i=>({id:i.id,articleName:i.articleName,quantity:i.quantity,unitPrice:i.unitPrice||"",description:i.description||"",note:i.note||"",clientSpec:i.clientSpec||"",productionUnit:i.productionUnit||"",plannedLoadingDate:i.plannedLoadingDate||""})):[{articleName:"",quantity:1,unitPrice:"",description:""}]);
    const ti:Record<number,Record<string,string>>={};
    const selected:Record<number,number[]>={};
    order.items?.forEach(i=>{if(i.id){ti[i.id]={pcb:i.pcb||"",colorTemperature:i.colorTemperature||"",lens:i.lens||"",driver:i.driver||"",electricalClass:i.electricalClass||"",accessories:i.accessories||"",otherTechSpecs:i.otherTechSpecs||""};selected[i.id]=(i.technicalComponents||[]).map(component=>component.materialId).filter((id):id is number=>id!==null);}});
    setTechItems(ti);setItemMaterialSelections(selected);setOpenTelegestionItem(null);setShowModal(true);setError("")};

  const handleSave = async()=>{setError("");setSaving(true);try{
    const needAgency = form.commercialStatus !== "SUR_STOCK";
    // Pour une nouvelle commande, le numéro sera auto-généré côté serveur
    // Pour une modification, on garde le numéro existant
    if(!form.clientId||(needAgency&&!form.agencyId)){setError(needAgency?"Client et agence requis":"Client requis");setSaving(false);return}
    const vi=formItems.filter(i=>i.articleName.trim());
    if(ce()){
      if(vi.length===0&&!editingOrder){setError("Au moins un article");setSaving(false);return}
      const pl:Record<string,unknown>={orderDate:form.orderDate,priority:"NORMALE",clientId:parseInt(form.clientId),agencyId:parseInt(form.agencyId),affaire:form.affaire||null,status:form.commercialStatus||"BON_COMMANDE",items:vi.map(i=>({id:i.id||undefined,articleName:i.articleName,quantity:i.quantity||1,note:i.note||null,clientSpec:i.clientSpec||null,unitPrice:i.unitPrice||null,description:i.description||null}))};
      // Ajouter orderNumber seulement pour les modifications
      if(editingOrder){pl.orderNumber=form.orderNumber;}
      if(form.commercialStatus==="ANNULEE"&&form.cancelReason)pl.cancelReason=form.cancelReason;
      if(editingOrder){await apiFetch(`/api/orders/${editingOrder.id}`,{method:"PUT",body:JSON.stringify(pl)})}else{await apiFetch("/api/orders",{method:"POST",body:JSON.stringify(pl)})}
      for(const item of vi){try{await apiFetch("/api/library/articles",{method:"POST",body:JSON.stringify({name:item.articleName})})}catch{}}
    }
    if(ct()&&editingOrder){
      const dynamicTechItems=(editingOrder.items||[]).filter(item=>item.id).map(item=>({itemId:item.id!,materialIds:itemMaterialSelections[item.id!]||[]}));
      await apiFetch(`/api/orders/${editingOrder.id}`,{method:"PUT",body:JSON.stringify({dynamicTechItems})});
    }
    if(cp()&&editingOrder){
      // Send per-item productionUnit + plannedLoadingDate
      const itemUpdates = Object.keys({...itemProdUnits,...itemLoadingDates}).map(k => ({itemId: parseInt(k), productionUnit: itemProdUnits[parseInt(k)] || undefined, plannedLoadingDate: itemLoadingDates[parseInt(k)] || undefined}));
      await apiFetch(`/api/orders/${editingOrder.id}`,{method:"PUT",body:JSON.stringify({priority:form.priority,productionStatus:form.productionStatus,statusReason:form.statusReason,cancelReason:form.cancelReason,itemUpdates})});
    }
    setShowModal(false);rf();fetchOrders()}catch(err:unknown){setError(err instanceof Error?err.message:"Erreur");setSaving(false)}};

  const hd=async(id:number)=>{if(!confirm("Supprimer?"))return;await apiFetch(`/api/orders/${id}`,{method:"DELETE"});fetchOrders()};
  const showExpeditionHistory=async(itemId:number)=>{setExpItemId(itemId);const d=await apiFetch<{batches:ExpeditionBatch[]}>(`/api/expedition/${itemId}`);setExpBatches(d.batches);setShowExpHistory(true)};
  const showModifications=async(orderId:number)=>{setModOrderId(orderId);const d=await apiFetch<{logs:typeof modLogs}>(`/api/order-modifications/${orderId}`);setModLogs(d.logs);setShowModHistory(true)};
  const ee=async()=>{const p=new URLSearchParams();if(fs)p.set("status",fs);if(fa)p.set("agencyId",fa);const token=getToken();const res=await fetch(`/api/orders/export?${p}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!res.ok){alert("Erreur export");return}const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`commandes_${new Date().toISOString().split("T")[0]}.xlsx`;a.click();URL.revokeObjectURL(url)};
  const ai=()=>setFormItems([...formItems,{articleName:"",quantity:1,unitPrice:"",description:""}]);
  const ri=(i:number)=>{if(formItems.length<=1)return;setFormItems(formItems.filter((_,x)=>x!==i))};
  const ui=(i:number,f:keyof OrderItem,v:string|number)=>{const u=[...formItems];(u[i]as Record<string,unknown>)[f]=v;setFormItems(u)};
  const uti=(itemId:number,field:string,value:string)=>{const t={...techItems};if(!t[itemId])t[itemId]={};t[itemId][field]=value;setTechItems(t)};
  const selectCategoryMaterial=(itemId:number,categoryId:number,materialId:number|null)=>setItemMaterialSelections(current=>{
    const categoryMaterialIds=new Set(materials.filter(material=>material.categoryId===categoryId).map(material=>material.id));
    const kept=(current[itemId]||[]).filter(id=>!categoryMaterialIds.has(id));
    return {...current,[itemId]:materialId?[...kept,materialId]:kept};
  });
  const toggleTelegestionMaterial=(itemId:number,materialId:number)=>setItemMaterialSelections(current=>{
    const selected=current[itemId]||[];
    return {...current,[itemId]:selected.includes(materialId)?selected.filter(id=>id!==materialId):[...selected,materialId]};
  });
  const hi=async()=>{const f=fileRef.current?.files?.[0];if(!f)return;const fd=new FormData();fd.append("file",f);fd.append("type",importType);try{const r=await apiFetch<{imported:number}>("/api/import",{method:"POST",body:fd});setImportMsg(`${r.imported} importés!`);if(importType==="clients"){const d=await apiFetch<{clients:Client[]}>("/api/clients");setClients(d.clients)}if(importType==="agencies"){const d=await apiFetch<{agencies:Agency[]}>("/api/agencies");setAgencies(d.agencies)}}catch(err:unknown){setImportMsg(err instanceof Error?err.message:"Erreur")}};

  // ── Études photométriques ──
  const loadStudiesForOrder = useCallback(async (orderId: number) => {
    if (orderStudies.has(orderId)) return;
    try {
      const d = await apiFetch<{ studies: typeof orderStudies extends Map<number, infer V> ? V : never }>(`/api/photometric-studies?orderId=${orderId}`);
      setOrderStudies(prev => new Map(prev).set(orderId, d.studies));
    } catch { /* ok */ }
  }, [orderStudies]);

  const openPhotoStudyModal = (study?: PhotoStudy) => {
    if (study) {
      setEditingStudy(study);
      setPhotoStudyForm({ id: String(study.id), orderId: study.orderId ? String(study.orderId) : "", clientId: study.clientId ? String(study.clientId) : "", affaireName: study.affaireName || "", studyNumber: study.studyNumber, note: study.note || "" });
      setPhotoStudyItems(study.items.length > 0 ? study.items.map(i => ({ productName: i.productName, lensId: i.lensId ? String(i.lensId) : "", note: i.note || "" })) : [{ productName: "", lensId: "", note: "" }]);
      setPhotoStudyMode(study.orderId ? "order" : "standalone");
    } else {
      setEditingStudy(null);
      setPhotoStudyForm({ id: "", orderId: "", clientId: "", affaireName: "", studyNumber: "", note: "" });
      setPhotoStudyItems([{ productName: "", lensId: "", note: "" }]);
      setPhotoStudyMode("order");
    }
    setShowPhotoStudyModal(true);
    setError("");
  };

  const savePhotoStudy = async () => {
    if (!photoStudyForm.studyNumber.trim()) { setError("N° d'étude requis"); return; }
    const validItems = photoStudyItems.filter(i => i.productName.trim());
    if (validItems.length === 0) { setError("Au moins un produit requis"); return; }
    if (photoStudyMode === "order" && !photoStudyForm.orderId) { setError("Sélectionnez une commande"); return; }
    if (photoStudyMode === "standalone" && !photoStudyForm.affaireName.trim()) { setError("Saisissez le nom de l'affaire"); return; }
    setPhotoStudySaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        studyNumber: photoStudyForm.studyNumber,
        note: photoStudyForm.note,
        clientId: photoStudyForm.clientId || null,
        items: validItems,
      };
      if (photoStudyMode === "order") payload.orderId = photoStudyForm.orderId;
      else payload.affaireName = photoStudyForm.affaireName;

      if (editingStudy) {
        payload.id = editingStudy.id;
        await apiFetch("/api/photometric-studies", { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/photometric-studies", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowPhotoStudyModal(false);
      setEditingStudy(null);
      if (photoStudyMode === "order" && photoStudyForm.orderId) {
        setOrderStudies(prev => { const n = new Map(prev); n.delete(parseInt(photoStudyForm.orderId)); return n; });
      }
      fetchStandaloneStudies();
      fetchOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPhotoStudySaving(false);
    }
  };

  const deletePhotoStudy = async (studyId: number) => {
    if (!confirm("Supprimer cette étude photométrique ?")) return;
    try {
      await apiFetch("/api/photometric-studies", { method: "DELETE", body: JSON.stringify({ id: studyId }) });
      setOrderStudies(new Map()); // Invalider tout le cache
      fetchStandaloneStudies();
      fetchOrders();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur");
    }
  };

  // Charger les études indépendantes (cas 2)
  const fetchStandaloneStudies = useCallback(async () => {
    try {
      const d = await apiFetch<{ studies: PhotoStudy[] }>("/api/photometric-studies?standalone=1");
      setStandaloneStudies(d.studies);
    } catch { /* ok */ }
  }, []);

  // Charger les études indépendantes au montage
  useEffect(() => { fetchStandaloneStudies(); }, [fetchStandaloneStudies]);

  const lensCategory = materialCategories.find(c => c.key === "lens" || c.name.toLowerCase().includes("lentille"));
  const lensMaterials = lensCategory ? materials.filter(m => m.categoryId === lensCategory.id) : [];

  const pc=(p:string)=>p==="TRES_URGENTE"?"bg-red-500 text-black border border-red-800":p==="URGENTE"?"bg-red-200 text-black border border-red-500":"bg-gray-200 text-black border border-gray-400";
  const commercialBadge=(status:string)=>status==="SUR_STOCK"?"bg-cyan-300 border-cyan-700":status==="BON_COMMANDE"?"bg-blue-300 border-blue-700":"bg-[#FFD3AC] border-orange-600";
  const productionBadge=(state:string,productionStatus?:string|null)=>state==="cancelled"?"bg-[#FF2C2C] border-[#B81F1F]":state==="delivered"?"bg-green-400 border-green-800":state==="awaiting-delivery"?"bg-[#FFF700] border-[#B8A900]":productionStatus==="EN_PRODUCTION"?"bg-yellow-300 border-yellow-700":"bg-violet-300 border-violet-700";
  const orderRowClass=(state:string,commercialStatus:string)=>state==="neutral"&&commercialStatus==="PREVISION"?"bg-[#FFD3AC] hover:bg-[#ffc28c] border-orange-600":ORDER_STATE_ROW_CLASSES[state as keyof typeof ORDER_STATE_ROW_CLASSES];
  const orderPanelClass=(state:string,commercialStatus:string)=>state==="neutral"&&commercialStatus==="PREVISION"?"bg-[#FFD3AC] border-orange-600":ORDER_STATE_PANEL_CLASSES[state as keyof typeof ORDER_STATE_PANEL_CLASSES];
  const highlight=(text:string)=>{if(!searchTerm||searchTerm.length<2)return text;const idx=text.toLowerCase().indexOf(searchTerm.toLowerCase());if(idx<0)return text;return <>{text.slice(0,idx)}<mark className="bg-yellow-300 dark:bg-yellow-500 text-black px-0.5 rounded">{text.slice(idx,idx+searchTerm.length)}</mark>{text.slice(idx+searchTerm.length)}</>};

  return (<div className="space-y-3 operational-content">
    <div className="flex flex-wrap gap-2 items-center">
      <select value={fs} onChange={e=>setFs(e.target.value)} className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"><option value="">États</option><option value="SUR_STOCK">📦</option><option value="BON_COMMANDE">📋</option><option value="PREVISION">🟠</option><option value="EN_INSTANCE">🟣</option><option value="EN_PRODUCTION">🟡</option><option value="LIVREE">🟢</option><option value="ANNULEE">🔴</option></select>
      <select value={fa} onChange={e=>setFa(e.target.value)} className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"><option value="">Agences</option>{agencies.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <select value={fp} onChange={e=>setFp(e.target.value)} className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"><option value="">Priorités</option><option value="TRES_URGENTE">Très Urgente</option><option value="URGENTE">Urgente</option><option value="NORMALE">Normale</option></select>
      <button onClick={fetchOrders} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-300">🔄 Actualiser</button>
      <label className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer flex items-center gap-1 transition-colors ${watchLive?"bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-400":"bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-300 dark:border-gray-600"}`}>
        <input type="checkbox" checked={watchLive} onChange={e=>setWatchLive(e.target.checked)} className="sr-only" />
        <span className={`w-2 h-2 rounded-full ${watchLive?"bg-green-500 animate-pulse":""}`}></span>📡 Live
      </label>
      <input type="text" placeholder="🔍 Filtrer dans le tableau..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
        className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-48 text-gray-700 dark:text-gray-200" />
      <div className="flex items-center gap-1 ml-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">Trier par</span>
        <select value={sortField} onChange={e=>setSortField(e.target.value as SortField)}
          className="px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
          <option value="date">Date</option>
          <option value="alpha">Alphabétique (A-Z)</option>
          <option value="number">N° Commande</option>
        </select>
        <button onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")} title={sortDir==="asc"?"Ordre croissant":"Ordre décroissant"}
          className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
          {sortDir==="asc"?"↑ Croissant":"↓ Décroissant"}
        </button>
      </div>
      <button onClick={toggleExpandAll} className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 rounded-lg text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/50">
        {allExpanded?"▾ Tout replier":"▸ Tout déplier"}
      </button>
      <div className="flex-1"/>
      <button onClick={()=>setShowImport(true)} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">📥 Import</button>
      <button onClick={ee} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">📤 Export</button>
      {ct()&&<button onClick={()=>openPhotoStudyModal()} className="px-4 py-1.5 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700">🔬 Nouvelle Étude Photométrique</button>}
      {ce()&&<button onClick={()=>{rf();setShowModal(true)}} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Nouvelle</button>}
    </div>

    {loading?<div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg></div>:
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-gray-50 dark:bg-gray-800 border-b text-left">
      <th className="px-2 py-2 w-6"></th><th className="px-2 py-2 font-semibold text-gray-600">N°</th><th className="px-2 py-2 font-semibold text-gray-600">Date</th><th className="px-2 py-2 font-semibold text-gray-600">Client</th><th className="px-2 py-2 font-semibold text-gray-600">Agence</th><th className="px-2 py-2 font-semibold text-gray-600">Affaire</th><th className="px-2 py-2 font-semibold text-gray-600">Priorité</th><th className="px-2 py-2 font-semibold text-gray-600">État Comm.</th><th className="px-2 py-2 font-semibold text-gray-600">État Prod.</th><th className="px-2 py-2 font-semibold text-gray-600">Créé par</th><th className="px-2 py-2 font-semibold text-gray-600">Modifié par</th><th className="px-2 py-2"></th>
    </tr></thead><tbody>
    {sortedOrders.length===0?<tr><td colSpan={14} className="text-center py-12 text-black">Aucune commande</td></tr>:
    sortedOrders.map(o=>{
      const expanded=expandedOrders.has(o.id);
      const ordered=o.items?.reduce((sum,item)=>sum+item.quantity,0)||o.totalQty||0;
      const produced=o.items?.reduce((sum,item)=>sum+(item.producedQty||0),0)||o.totalProduced||0;
      const delivered=o.items?.reduce((sum,item)=>sum+(item.deliveredQty||0),0)||o.totalDelivered||0;
      const visualState=getOrderVisualState({productionStatus:o.productionStatus,ordered,produced,delivered});
      const operationalLabel=visualState==="neutral"?(o.productionStatus==="EN_PRODUCTION"?"En production":"En instance"):ORDER_STATE_LABELS[visualState];
      return (<React.Fragment key={o.id}><tr className={`cursor-pointer border-l-4 text-black [&_td]:text-black [&_span]:text-black [&_b]:text-black ${orderRowClass(visualState,o.status)}`} onClick={()=>toggleExpand(o.id)}>
        <td className="px-2 py-1.5 text-center font-bold">{expanded?"▾":"▸"}</td>
        <td className="px-2 py-1.5 font-medium">{highlight(o.orderNumber)}</td>
        <td className="px-2 py-1.5 text-[10px]">{o.orderDate}</td>
        <td className="px-2 py-1.5">{highlight(o.clientName||"")}</td>
        <td className="px-2 py-1.5 text-[10px]">{o.agencyName}</td>
        <td className="px-2 py-1.5 text-[10px] font-medium">{highlight(o.affaire||"-")}</td>
        <td className="px-2 py-1.5"><span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${pc(o.priority)}`}>{PRIORITY_LABELS[o.priority]}</span></td>
        <td className="px-2 py-1.5"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${commercialBadge(o.status)}`}>{o.status==="SUR_STOCK"?"Stock":o.status==="BON_COMMANDE"?"Bon de commande":"Prévision"}</span></td>
        <td className="px-2 py-1.5" title={o.statusReason||""}><span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${productionBadge(visualState,o.productionStatus)}`}>{operationalLabel}</span>{o.statusReason&&<span className="text-[8px] ml-1 cursor-help">💬</span>}{visualState==="cancelled"&&o.cancelReason&&<span className="text-[9px] ml-1">({o.cancelReason})</span>}</td>
        <td className="px-2 py-1.5 text-[10px]">{o.createdByName||"-"}</td>
        <td className="px-2 py-1.5 text-[10px] flex items-center gap-1">{o.updatedBy||"-"}<button onClick={(e)=>{e.stopPropagation();showModifications(o.id)}} className="text-[11px]" title="Historique des modifications">📝</button></td>
        <td className="px-2 py-1.5 text-right" onClick={e=>e.stopPropagation()}><button onClick={()=>oe(o)} className="px-2 py-1 text-[10px] bg-white/70 border border-black/30 text-black rounded">Détails</button>{cd&&<button onClick={()=>hd(o.id)} className="ml-1 px-2 py-1 text-[10px] bg-white/70 border border-black/30 text-black rounded">✕</button>}</td>
      </tr>
      {expanded&&o.items&&o.items.length>0&&<tr key={`${o.id}-exp`} className={`text-black [&_td]:text-black [&_span]:text-black [&_b]:text-black ${orderPanelClass(visualState,o.status)}`}><td colSpan={14} className="px-2 py-2">
        <table className="w-full text-[11px] border-collapse"><thead><tr className="text-left text-black border-b border-black/30">
          <th className="px-1 py-1">Article</th><th className="px-1 py-1">Cmd</th><th className="px-1 py-1">Unité</th><th className="px-1 py-1">Prod</th><th className="px-1 py-1">Livré</th><th className="px-1 py-1">Stock</th><th className="px-1 py-1">Reste à livrer</th>
          <th className="px-1 py-1">Besoin</th><th className="px-1 py-1">Spécs Tech</th><th className="px-1 py-1">Note</th><th className="px-1 py-1">Expéd</th>
        </tr></thead><tbody>
        {o.items.map(it => (
          <OrderItemRow
            key={it.id}
            item={it}
            orderId={o.id}
            visualState={visualState as OrderVisualState}
            modifications={orderModificationsCache.get(o.id)}
            highlight={highlight}
            fmtDate={fmtDate}
            onShowExpeditionHistory={showExpeditionHistory}
          />
        ))}
        <tr className="bg-white/60 text-[10px] text-black"><td className="px-1 py-1 font-semibold">TOTAL</td><td className="px-1 py-1">{ordered}</td><td className="px-1 py-1"></td><td className="px-1 py-1">{produced}</td><td className="px-1 py-1">{delivered}</td><td className="px-1 py-1">{Math.max(0,produced-delivered)}</td><td className="px-1 py-1"><span className="remaining-to-deliver">{Math.max(0,ordered-delivered)}</span></td><td className="px-1 py-1" colSpan={4}></td></tr>
        {/* Études photométriques de cette commande */}
        {(orderStudies.get(o.id) || []).map(study => (
          <React.Fragment key={`study-${study.id}`}>
            <tr className="border-b border-black/10" style={{ backgroundColor: getColor("ETUDE_PHOTOMETRIQUE"), color: "#000" }}>
              <td className="px-1 py-1.5 text-[10px] font-bold" colSpan={2}>🔬 Étude #{study.studyNumber}</td>
              <td className="px-1 py-1.5 text-[10px]" colSpan={2}>{study.clientName && <><b>Client:</b> {study.clientName}</>}</td>
              <td className="px-1 py-1.5 text-[10px]" colSpan={2}>{study.note || ""}</td>
              <td className="px-1 py-1.5 text-[8px]" colSpan={3}>Par {study.createdByName} • {fmtDate(study.createdAt)}</td>
              <td className="px-1 py-1.5 text-right" colSpan={2} onClick={e => e.stopPropagation()}>
                {ct() && <button onClick={() => openPhotoStudyModal(study)} className="text-[9px] underline mr-2">Modifier</button>}
                {cd && <button onClick={() => deletePhotoStudy(study.id)} className="text-[9px] underline text-red-700">Supprimer</button>}
              </td>
            </tr>
            {study.items.map((si, idx) => (
              <tr key={`si-${study.id}-${idx}`} className="border-b border-black/10" style={{ backgroundColor: getColor("ETUDE_PHOTOMETRIQUE") + "88", color: "#000" }}>
                <td className="px-1 py-1 text-[9px]"></td>
                <td className="px-1 py-1 text-[10px] font-medium" colSpan={2}>↳ {si.productName}</td>
                <td className="px-1 py-1 text-[10px]" colSpan={2}>{si.lensReference ? <span><b>{si.lensReference}</b></span> : ""}</td>
                <td className="px-1 py-1 text-[10px]" colSpan={2}>{si.lensLabel || <span className="italic text-gray-600">—</span>}</td>
                <td className="px-1 py-1 text-[9px]" colSpan={4}>{si.note || ""}</td>
              </tr>
            ))}
          </React.Fragment>
        ))}
        </tbody></table>
      </td></tr>}
      </React.Fragment>)})}
    </tbody></table></div></div>}

    {showModal&&(<div className="fixed inset-0 z-50 flex items-start justify-center pt-4 pb-4 overflow-y-auto"><div className="absolute inset-0 bg-black/50" onClick={()=>setShowModal(false)}/><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl mx-2 max-h-[94vh] overflow-y-auto">
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b px-5 py-3 rounded-t-2xl flex justify-between z-10"><div><h3 className="text-lg font-semibold text-gray-800 dark:text-white">{editingOrder?`N°${editingOrder.orderNumber}`:"Nouvelle Commande"}</h3>{editingOrder?.createdByName&&<span className="text-xs text-gray-500">Créée par {editingOrder.createdByName}</span>}{editingOrder?.updatedBy&&<span className="text-xs text-gray-500 ml-3">Modifié par {editingOrder.updatedBy}</span>}</div><button onClick={()=>setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button></div>
      <div className="p-5 space-y-5">{error&&<div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      {(ce()||editingOrder)&&<fieldset className="border border-blue-200 dark:border-blue-800 rounded-xl p-4 bg-blue-50/30 dark:bg-blue-900/10"><legend className="text-sm font-bold text-blue-700 px-2">📋 COMMERCIAL</legend>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
        {/* N° Commande - Lecture seule, généré automatiquement */}
        <div>
          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">N° Commande</label>
          <div className={`w-full px-3 py-2 border rounded-lg text-sm font-bold ${editingOrder ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-blue-50 border-blue-300 text-blue-700"}`}>
            {editingOrder ? form.orderNumber : (form.orderNumber || "Auto-généré")}
          </div>
          {!editingOrder && <span className="text-[10px] text-blue-600 mt-0.5 block">Format: N/AAAA (ex: 1/2026)</span>}
        </div>
        <F l="Date" type="date" v={form.orderDate} onChange={v=>setForm({...form,orderDate:v})} disabled={!ce()&&!!editingOrder}/>
        {/* État initial : 3 choix pour le commercial */}
        <div><label className="block text-[11px] font-medium text-gray-600 mb-1">État initial</label>
          <button type="button" onClick={()=>setForm({...form,commercialStatus:form.commercialStatus==="BON_COMMANDE"?"PREVISION":form.commercialStatus==="PREVISION"?"SUR_STOCK":"BON_COMMANDE"})} disabled={!ce()&&!!editingOrder}
            className={`w-full px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${form.commercialStatus==="SUR_STOCK"?"bg-cyan-100 border-cyan-400 text-cyan-800":form.commercialStatus==="BON_COMMANDE"?"bg-blue-100 border-blue-400 text-blue-800":"bg-orange-100 border-orange-400 text-orange-800"}`}>
            {form.commercialStatus==="SUR_STOCK"?"📦 Sur Stock / Besoin interne":form.commercialStatus==="BON_COMMANDE"?"📋 Bon de Commande reçu":"🔮 Prévision"}
          </button>
        </div>
        <AutocompleteSelect label="Client *" items={clients.map(c=>({id:c.id,label:c.name}))} value={form.clientId} onChange={v=>setForm({...form,clientId:v})} disabled={!ce()&&!!editingOrder} />
        <AutocompleteSelect label="Agence *" items={agencies.map(a=>({id:a.id,label:a.name}))} value={form.agencyId} onChange={v=>setForm({...form,agencyId:v})} disabled={!ce()&&!!editingOrder} />
        <div><label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">N° Affaire</label><AutocompleteInput value={form.affaire} onChange={v=>setForm({...form,affaire:v})} suggestUrl="/api/library/affaires" placeholder="Affaire" disabled={!ce()&&!!editingOrder} /></div>
      </div>
      {ce()&&<div className="mt-4">
      <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-2">Articles</label>
      {/* Header labels */}
      <div className="hidden md:flex gap-2 mb-1 px-0.5">
        <span className="flex-[3] text-[10px] font-semibold text-gray-500 dark:text-gray-400">Article</span>
        <span className="w-20 text-[10px] font-semibold text-gray-500 dark:text-gray-400 text-center">Quantité</span>
        <span className="flex-[2] text-[10px] font-semibold text-gray-500 dark:text-gray-400">Besoin client</span>
        <span className="flex-[2] text-[10px] font-semibold text-gray-500 dark:text-gray-400">Note</span>
        <span className="w-7"></span>
      </div>
      <div className="space-y-2">{formItems.map((item,idx)=>
        <div key={idx} className="flex gap-2 items-center">
          <div className="flex-[3] min-w-0">
            <AutocompleteInput value={item.articleName} onChange={v=>ui(idx,"articleName",v)} suggestUrl="/api/library/articles" placeholder="Article" />
          </div>
          <div className="w-20 shrink-0">
            <input type="number" placeholder="Qté" min={1} value={item.quantity}
              onChange={e=>ui(idx,"quantity",parseInt(e.target.value)||1)}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm font-bold text-center bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100" />
          </div>
          <div className="flex-[2] min-w-0">
            <input type="text" placeholder="Besoin client" value={item.clientSpec||""} onChange={e=>ui(idx,"clientSpec",e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200" />
          </div>
          <div className="flex-[2] min-w-0">
            <input type="text" placeholder="Note" value={item.note||""} onChange={e=>ui(idx,"note",e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200" />
          </div>
          <div className="w-7 shrink-0 flex justify-center">
            {formItems.length>1 && <button onClick={()=>ri(idx)} className="p-1 text-red-500 hover:text-red-700 text-sm">✕</button>}
          </div>
        </div>
      )}</div>
      <button onClick={ai} className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">+ Ajouter article</button></div>}
      {!ce()&&editingOrder&&<div className="mt-3 text-xs text-gray-600 space-y-1">{editingOrder.items?.map((it,i)=><div key={i} className="flex gap-2"><span className="font-medium">{it.articleName}</span><span>×{it.quantity}</span></div>)}</div>}
      </fieldset>}

      {ct()&&editingOrder&&<fieldset className="border-2 border-gray-400 rounded-xl p-4 bg-gray-50"><legend className="text-sm font-bold text-black px-2">⚙️ SPÉCIFICATIONS TECHNIQUES PAR ARTICLE</legend>
      <p className="text-xs text-black mb-4">Les choix proviennent de la table Matières. La référence, le libellé, l&apos;utilisateur et la date seront conservés pour chaque composant.</p>
      {editingOrder.items?.filter(i=>i.id).map(it=>{
        const selectedIds=itemMaterialSelections[it.id!]||[];
        const normalCategories=materialCategories.filter(category=>category.active&&!category.isTelegestion);
        const telegestionCategory=materialCategories.find(category=>category.active&&category.isTelegestion);
        const telegestionMaterials=materials.filter(material=>material.categoryId===telegestionCategory?.id);
        return <div key={it.id} className="mb-4 border-2 border-gray-300 rounded-xl p-4 bg-white text-black">
          <div className="flex items-center justify-between gap-3 mb-3"><div><div className="font-bold text-base text-black">{it.articleName}</div><div className="text-xs text-black">Quantité commandée : {it.quantity}</div></div>
            {telegestionCategory&&<button type="button" onClick={()=>setOpenTelegestionItem(openTelegestionItem===it.id?null:it.id!)} className="px-3 py-2 rounded-lg border-2 border-sky-700 bg-sky-200 text-black text-xs font-bold">📡 Options de télégestion ({selectedIds.filter(id=>telegestionMaterials.some(material=>material.id===id)).length})</button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {normalCategories.map(category=>{
              const categoryMaterials=materials.filter(material=>material.categoryId===category.id);
              const selected=selectedIds.find(id=>categoryMaterials.some(material=>material.id===id))||null;
              return <CategoryMaterialSelect
                key={category.id}
                categoryId={category.id}
                categoryName={category.name}
                selectedMaterialId={selected}
                onSelect={(materialId)=>selectCategoryMaterial(it.id!,category.id,materialId)}
              />})}
          </div>
          {openTelegestionItem===it.id&&telegestionCategory&&<div className="mt-3 rounded-xl border-2 border-sky-600 bg-sky-50 p-3"><div className="font-bold text-black mb-2">Accessoires de télégestion à ajouter</div>
            {telegestionMaterials.length===0?<p className="text-xs text-black">Aucun accessoire. Ajoutez-les d&apos;abord dans Table Matières → Accessoire de télégestion.</p>:<div className="grid grid-cols-1 md:grid-cols-2 gap-2">{telegestionMaterials.map(material=><label key={material.id} className="flex items-start gap-2 rounded-lg border border-sky-300 bg-white p-2 cursor-pointer"><input type="checkbox" checked={selectedIds.includes(material.id)} onChange={()=>toggleTelegestionMaterial(it.id!,material.id)} className="mt-0.5"/><span className="text-xs text-black"><b>{material.reference}</b> — {material.name}<br/><span>Stock indicatif : {material.stock}</span></span></label>)}</div>}
          </div>}
        </div>})}
      </fieldset>}

      {cp()&&editingOrder&&<fieldset className="border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 bg-emerald-50/30 dark:bg-emerald-900/10"><legend className="text-sm font-bold text-emerald-700 px-2">📅 PLANIFICATION</legend>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Priorité</label><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} className="w-full px-2 py-2 bg-white border rounded-lg text-sm"><option value="PREVISION">Prévision</option><option value="NORMALE">Normale</option><option value="URGENTE">Urgente</option><option value="TRES_URGENTE">Très Urgente</option></select></div>
        <div><label className="block text-[11px] font-medium text-gray-600 mb-1">État</label><select value={form.productionStatus} onChange={e=>setForm({...form,productionStatus:e.target.value})} className="w-full px-2 py-2 bg-white border rounded-lg text-sm"><option value="EN_INSTANCE">🟣 En instance</option><option value="EN_PRODUCTION">🟡 En production</option><option value="LIVREE">🟢 Livrée</option><option value="ANNULEE">🔴 Annulée</option></select></div>
        <div><F l="Motif changement" v={form.statusReason} onChange={v=>setForm({...form,statusReason:v})}/></div>
        {form.productionStatus==="ANNULEE"&&<div className="md:col-span-2"><F l="Cause annulation" v={form.cancelReason} onChange={v=>setForm({...form,cancelReason:v})}/></div>}
      </div>
      <div className="text-xs font-medium text-gray-600 mb-2">Unité Production par article :</div>
      {editingOrder.items?.filter(i=>i.id).map(it=><div key={it.id} className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-gray-600 w-24 truncate">{it.articleName}</span>
        <input type="text" placeholder="Unité Prod" value={itemProdUnits[it.id!]||(it.productionUnit||'')} onChange={e=>setItemProdUnits({...itemProdUnits,[it.id!]:e.target.value})} className="flex-1 px-2 py-1 border rounded text-xs"/>
      </div>)}
      </fieldset>}

      </div>
      <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t px-5 py-3 rounded-b-2xl flex justify-end gap-2"><button onClick={()=>setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button><button onClick={handleSave} disabled={saving} className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving?"...":editingOrder?"Enregistrer":"Créer"}</button></div></div></div>)}

    {showImport&&<div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={()=>setShowImport(false)}/><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"><h4 className="text-lg font-semibold mb-4">📥 Import Excel</h4>{importMsg&&<div className="mb-3 p-2 rounded-lg bg-green-50 text-green-700 text-sm">{importMsg}</div>}<div className="space-y-3"><div><label className="block text-xs font-medium text-gray-600 mb-1">Type</label><select value={importType} onChange={e=>setImportType(e.target.value)} className="w-full px-3 py-2 bg-white border rounded-lg text-sm"><option value="clients">Clients</option><option value="agencies">Agences</option></select></div><div><label className="block text-xs font-medium text-gray-600 mb-1">Fichier .xlsx</label><input type="file" accept=".xlsx,.xls" ref={fileRef} className="w-full text-sm"/></div></div><div className="flex justify-end gap-2 mt-6"><button onClick={()=>setShowImport(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button><button onClick={hi} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">Importer</button></div></div></div>}
  
    {/* MODIFICATION HISTORY MODAL */}
    {showModHistory&&<div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={()=>setShowModHistory(false)}/><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto p-6"><h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">📝 Historique des modifications</h4>
    {modLogs.length===0?<p className="text-gray-400 text-sm">Aucune modification enregistrée.</p>:
    <table className="w-full text-xs"><thead><tr className="bg-gray-50 dark:bg-gray-800 border-b text-left"><th className="px-2 py-2">Date</th><th className="px-2 py-2">Utilisateur</th><th className="px-2 py-2">Champ</th><th className="px-2 py-2">Ancien</th><th className="px-2 py-2">Nouveau</th></tr></thead><tbody>{modLogs.map(l=><tr key={l.id}><td className="px-2 py-1.5 text-[10px] text-gray-500">{fmtDate(l.createdAt)}</td><td className="px-2 py-1.5 font-medium">{l.username}</td><td className="px-2 py-1.5">{l.field}</td><td className="px-2 py-1.5 text-gray-400 text-[10px] max-w-[150px] truncate">{l.oldValue||"-"}</td><td className="px-2 py-1.5 font-medium text-blue-600 text-[10px] max-w-[150px] truncate">{l.newValue||"-"}</td></tr>)}</tbody></table>}
    <div className="flex justify-end mt-4"><button onClick={()=>setShowModHistory(false)} className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg">Fermer</button></div></div></div>}

    {/* EXPEDITION HISTORY MODAL */}
    {showExpHistory&&<div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={()=>setShowExpHistory(false)}/><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto p-6"><h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">📋 Historique des Expeditions</h4>
    {expBatches.length===0?<p className="text-gray-400 text-sm">Aucune expedition enregistree.</p>:
    <table className="w-full text-xs"><thead><tr className="bg-gray-50 dark:bg-gray-800 border-b text-left"><th className="px-2 py-2">Date</th><th className="px-2 py-2">Qte</th><th className="px-2 py-2">Cumul</th><th className="px-2 py-2">Chargement</th><th className="px-2 py-2">Chauffeur</th><th className="px-2 py-2">Livré par</th><th className="px-2 py-2">Note</th></tr></thead><tbody>{expBatches.map(b=><tr key={b.id}><td className="px-2 py-1.5">{b.deliveryDate}</td><td className="px-2 py-1.5 font-bold text-blue-600">+{b.quantity}</td><td className="px-2 py-1.5 font-bold">{b.cumulativeTotal}</td><td className="px-2 py-1.5 text-[10px]">{b.plannedLoadingDate||'-'}</td><td className="px-2 py-1.5">{b.driverName||'-'}</td><td className="px-2 py-1.5">{b.deliveredBy}</td><td className="px-2 py-1.5 text-[10px]">{b.note||'-'}</td></tr>)}</tbody></table>}
    <div className="flex justify-end mt-4"><button onClick={()=>setShowExpHistory(false)} className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg">Fermer</button></div></div></div>}

    {/* PHOTOMETRIC STUDY MODAL */}
    {showPhotoStudyModal&&<div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={()=>setShowPhotoStudyModal(false)}/><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto p-6">
      <h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">🔬 Nouvelle Étude Photométrique</h4>
      {error&&<div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm mb-4">{error}</div>}

      {/* Sélecteur de mode : commande existante ou affaire libre */}
      <div className="flex gap-2 mb-5">
        <button onClick={()=>setPhotoStudyMode("order")} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${photoStudyMode==="order" ? "bg-sky-100 border-sky-500 text-sky-800" : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"}`}>
          📋 Lier à une commande existante
        </button>
        <button onClick={()=>setPhotoStudyMode("standalone")} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${photoStudyMode==="standalone" ? "bg-amber-100 border-amber-500 text-amber-800" : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"}`}>
          ✏️ Étude indépendante (affaire libre)
        </button>
      </div>

      <div className="space-y-4">
        {/* Cas 1 : Sélection d'une commande existante */}
        {photoStudyMode==="order" && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Commande *</label>
            <select value={photoStudyForm.orderId} onChange={e=>setPhotoStudyForm({...photoStudyForm, orderId: e.target.value})}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
              <option value="">— Sélectionner une commande —</option>
              {orders.map(o=><option key={o.id} value={o.id}>{o.orderNumber} — {o.affaire || o.clientName || "Sans affaire"}</option>)}
            </select>
          </div>
        )}

        {/* Cas 2 : Nom d'affaire libre */}
        {photoStudyMode==="standalone" && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nom de l&apos;Affaire *</label>
            <input type="text" value={photoStudyForm.affaireName} onChange={e=>setPhotoStudyForm({...photoStudyForm, affaireName: e.target.value})}
              placeholder="Nom de l'affaire..." className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"/>
          </div>
        )}

        {/* N° Étude + Client (côte à côte) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">N° de l&apos;Étude *</label>
            <input type="text" value={photoStudyForm.studyNumber} onChange={e=>setPhotoStudyForm({...photoStudyForm, studyNumber: e.target.value})}
              placeholder="Ex: EP-2026-001" className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Client</label>
            <select value={photoStudyForm.clientId} onChange={e=>setPhotoStudyForm({...photoStudyForm, clientId: e.target.value})}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
              <option value="">— Aucun client —</option>
              {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        {/* Note globale */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Note</label>
          <input type="text" value={photoStudyForm.note} onChange={e=>setPhotoStudyForm({...photoStudyForm, note: e.target.value})}
            placeholder="Note libre..." className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"/>
        </div>
        {/* Produits (N articles) */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Produits Concernés *</label>
          <div className="hidden md:flex gap-2 mb-1 px-0.5 text-[10px] font-semibold text-gray-500">
            <span className="flex-[3]">Produit</span>
            <span className="flex-[2]">Lentille</span>
            <span className="flex-[2]">Note produit</span>
            <span className="w-7"></span>
          </div>
          <div className="space-y-2">
            {photoStudyItems.map((si, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <div className="flex-[3] min-w-0">
                  <AutocompleteInput value={si.productName} onChange={v => { const u = [...photoStudyItems]; u[idx] = { ...u[idx], productName: v }; setPhotoStudyItems(u); }}
                    suggestUrl="/api/library/articles" placeholder="Nom du produit"/>
                </div>
                <div className="flex-[2] min-w-0">
                  <select value={si.lensId} onChange={e => { const u = [...photoStudyItems]; u[idx] = { ...u[idx], lensId: e.target.value }; setPhotoStudyItems(u); }}
                    className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm">
                    <option value="">— Lentille —</option>
                    {lensMaterials.map(m => <option key={m.id} value={m.id}>{m.reference} — {m.name}</option>)}
                  </select>
                </div>
                <div className="flex-[2] min-w-0">
                  <input type="text" value={si.note} onChange={e => { const u = [...photoStudyItems]; u[idx] = { ...u[idx], note: e.target.value }; setPhotoStudyItems(u); }}
                    placeholder="Note" className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm"/>
                </div>
                <div className="w-7 shrink-0 flex justify-center">
                  {photoStudyItems.length > 1 && <button onClick={() => setPhotoStudyItems(photoStudyItems.filter((_, i) => i !== idx))} className="p-1 text-red-500 hover:text-red-700 text-sm">✕</button>}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setPhotoStudyItems([...photoStudyItems, { productName: "", lensId: "", note: "" }])} className="mt-2 text-xs text-sky-600 hover:underline">+ Ajouter un produit</button>
          {lensMaterials.length === 0 && <p className="text-[10px] text-amber-600 mt-1">Aucune lentille dans la table Matières.</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button onClick={() => { setShowPhotoStudyModal(false); setEditingStudy(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
        <button onClick={savePhotoStudy} disabled={photoStudySaving} className="px-6 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50">
          {photoStudySaving ? "Enregistrement..." : editingStudy ? "💾 Enregistrer" : "🔬 Créer l'Étude"}
        </button>
      </div>
    </div></div>}

    {/* ═══════════════════════════════════════════════════════════════════ */}
    {/* SECTION 2 : Études Photométriques Indépendantes (cas 2)           */}
    {/* ═══════════════════════════════════════════════════════════════════ */}
    {standaloneStudies.length > 0 && (
      <div className="mt-6">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">🔬 Études Photométriques Indépendantes</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{standaloneStudies.length}</span>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left" style={{ backgroundColor: getColor("ETUDE_PHOTOMETRIQUE"), opacity: 0.7 }}>
                  <th className="px-2 py-2 font-semibold text-black">N° Étude</th>
                  <th className="px-2 py-2 font-semibold text-black">Client</th>
                  <th className="px-2 py-2 font-semibold text-black">Affaire</th>
                  <th className="px-2 py-2 font-semibold text-black">Produits</th>
                  <th className="px-2 py-2 font-semibold text-black">Lentille</th>
                  <th className="px-2 py-2 font-semibold text-black">Note</th>
                  <th className="px-2 py-2 font-semibold text-black">Responsable</th>
                  <th className="px-2 py-2 font-semibold text-black">Date</th>
                  <th className="px-2 py-2 font-semibold text-black">Actions</th>
                </tr>
              </thead>
              <tbody>
                {standaloneStudies.map(study => (
                  <tr key={study.id} className="border-b border-black/10 hover:opacity-90 align-top" style={{ backgroundColor: getColor("ETUDE_PHOTOMETRIQUE") + "33" }}>
                    <td className="px-2 py-1.5 font-bold text-[11px] text-black">🔬 {study.studyNumber}</td>
                    <td className="px-2 py-1.5 text-[11px] text-black">{study.clientName || "-"}</td>
                    <td className="px-2 py-1.5 font-medium text-[11px] text-black">{study.affaireName || "-"}</td>
                    <td className="px-2 py-1.5 text-[10px] text-black">
                      {study.items.map((si, idx) => (
                        <div key={idx} className="mb-0.5"><b>{si.productName}</b>{si.note && <span className="ml-1 text-[9px] italic">({si.note})</span>}</div>
                      ))}
                      {study.items.length === 0 && <span className="italic text-gray-500">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-black">
                      {study.items.map((si, idx) => (
                        <div key={idx} className="mb-0.5">{si.lensReference ? <><b>{si.lensReference}</b> — {si.lensLabel}</> : <span className="text-gray-400">—</span>}</div>
                      ))}
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-black max-w-[120px] truncate" title={study.note || ""}>{study.note || "-"}</td>
                    <td className="px-2 py-1.5 text-[10px] text-black">{study.createdByName}</td>
                    <td className="px-2 py-1.5 text-[10px] text-black">{fmtDate(study.createdAt)}</td>
                    <td className="px-2 py-1.5 text-[10px]">
                      {ct() && <button onClick={() => openPhotoStudyModal(study)} className="text-[9px] underline mr-2 text-black">Modifier</button>}
                      {cd && <button onClick={() => deletePhotoStudy(study.id)} className="text-[9px] underline text-red-700">Supprimer</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
</div>);
}
function F({l,type="text",v,onChange,disabled}:{l:string;type?:string;v:string;onChange:(v:string)=>void;disabled?:boolean}){return <div><label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">{l}</label><input type={type} value={v} onChange={e=>onChange(e.target.value)} disabled={disabled} className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm ${disabled?"bg-gray-100":"bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"}`}/></div>}
function AutocompleteSelect({label,items,value,onChange,disabled}:{label:string;items:{id:number;label:string}[];value:string;onChange:(v:string)=>void;disabled?:boolean}){
  const [q,setQ]=useState(items.find(i=>String(i.id)===value)?.label||"");
  const [show,setShow]=useState(false);
  const filtered=items.filter(i=>i.label.toLowerCase().includes(q.toLowerCase())).slice(0,8);
  return <div className="relative"><label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
    <input type="text" value={q} onChange={e=>{setQ(e.target.value);onChange("");setShow(true)}} onFocus={()=>setShow(true)} onBlur={()=>setTimeout(()=>setShow(false),200)} disabled={disabled}
      className={`w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm ${disabled?"bg-gray-100":"bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"}`} />
    {show&&filtered.length>0&&<div className="absolute z-20 top-full left-0 right-0 bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-40 overflow-y-auto">
      {filtered.map(c=><div key={c.id} className="px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-200" onMouseDown={()=>{onChange(String(c.id));setQ(c.label);setShow(false)}}>{c.label}</div>)}
    </div>}
  </div>;
}
