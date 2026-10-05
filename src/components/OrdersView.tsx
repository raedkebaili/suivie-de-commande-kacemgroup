"use client";
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import type { Order, OrderItem, Agency, Client, User, ExpeditionBatch, MaterialCategory, Material, ClientRecouvrementAssignment } from "@/lib/types";
import RecouvrementAlertCell from "@/components/RecouvrementAlertCell";
import ArticleGroupingView from "@/components/ArticleGroupingView";
import AutocompleteInput from "@/components/AutocompleteInput";
import CategoryMaterialSelect from "@/components/CategoryMaterialSelect";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { articleLensToValue, LENS_OVERRIDE_MESSAGE, lensSourceBadge, latestStudyItemForOrderItem, resolveStudyLens } from "@/lib/study-lens";
import { sanitizeItemsOnOrderChange, type ArticleOption } from "@/lib/study-search";
import { PRIORITY_LABELS } from "@/lib/types";
import { PRIORITY_OPTIONS, priorityColorKey, priorityLabel } from "@/lib/priority";
import { getOrderVisualState, ORDER_STATE_LABELS, ORDER_STATE_PANEL_CLASSES, ORDER_STATE_ROW_CLASSES, OrderVisualState } from "@/lib/order-visual-state";
import { useColors } from "@/lib/color-context";
import { darkenColor, getContrastTextColor } from "@/lib/color-utils";
import OrderItemRow from "@/components/OrderItemRow";
import DocumentsPanel, { PendingDocumentsZone, uploadPendingDocuments, documentDownloadUrl, type PendingDocument } from "@/components/DocumentsPanel";

type FullOrder = Order & { totalQty?: number; totalDelivered?: number; totalProduced?: number; totalRemaining?: number; documentCount?: number; hasCahierDesCharges?: boolean };

function normalizeOrderSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function orderMatchesSearch(order: FullOrder, query: string): boolean {
  const haystack = [
    order.orderNumber,
    order.clientName,
    order.clientCode,
    order.affaire,
    ...(order.items || []).map((item) => item.articleName),
  ].map((value) => normalizeOrderSearch(value || ""));
  return haystack.some((value) => value.includes(query));
}

function DebouncedSearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const timer = window.setTimeout(() => onChange(draft), 180);
    return () => window.clearTimeout(timer);
  }, [draft, onChange]);

  return (
    <input
      type="text"
      placeholder="🔍 Filtrer dans le tableau..."
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-48 text-gray-700 dark:text-gray-200"
    />
  );
}

/**
 * Garde la ligne d'une commande dépliée légère tant qu'elle est loin de la
 * fenêtre. Le détail est monté à l'approche du viewport : toutes les données
 * restent accessibles en défilant, mais React/DOM ne crée pas simultanément
 * tous les tableaux d'articles et leurs composants techniques.
 */
function DeferredOrderDetails({
  estimatedHeight,
  children,
}: {
  estimatedHeight: number;
  children: () => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: `0 ${estimatedHeight}px`,
        minHeight: visible ? undefined : estimatedHeight,
      }}
    >
      {visible ? children() : null}
    </div>
  );
}

type SortField = "date" | "alpha" | "number";
type SortDir = "asc" | "desc";

// Colonnes masquables du tableau principal (config administrée par le superadmin,
// stockée côté serveur dans system_settings — clé "orders_hidden_columns").
// Les colonnes N°, Client, État Prod. et Actions restent toujours visibles.
const ORDER_TABLE_COLUMNS: { key: string; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "agence", label: "Agence" },
  { key: "affaire", label: "Affaire" },
  { key: "priorite", label: "Priorité" },
  { key: "etatComm", label: "État Comm." },
  { key: "creePar", label: "Créé par" },
  { key: "modifiePar", label: "Modifié par" },
];
// Nombre total de colonnes du tableau principal (toggle + 10 data + actions)
const ORDER_TABLE_TOTAL_COLS = 12;

// États de production masquables individuellement dans la colonne « État Prod. ».
// Masquer un état n'enlève ni la colonne ni la ligne : seul le badge est remplacé
// par un tiret. Les couleurs de ligne et les calculs restent inchangés.
const PRODUCTION_STATE_OPTIONS: { key: string; label: string }[] = [
  { key: "EN_INSTANCE", label: "En instance" },
  { key: "EN_PRODUCTION", label: "En production" },
  { key: "AWAITING_DELIVERY", label: "En attente de livraison" },
  { key: "LIVREE", label: "Livrée" },
  { key: "ANNULEE", label: "Annulée" },
];

/** Clé de l'état de production réellement affiché pour une ligne */
function productionStateKey(visualState: string, productionStatus?: string | null): string {
  if (visualState === "cancelled") return "ANNULEE";
  if (visualState === "delivered") return "LIVREE";
  if (visualState === "awaiting-delivery") return "AWAITING_DELIVERY";
  return productionStatus === "EN_PRODUCTION" ? "EN_PRODUCTION" : "EN_INSTANCE";
}

// Extract the leading numeric part of an order number like "12-2026" -> 12.
// Falls back to +Infinity so unparsable numbers sort last regardless of direction intent.
function orderNumericPart(orderNumber: string | undefined): number {
  const m = /^(\d+)/.exec(orderNumber || "");
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

function fmtDate(d: string): string { if (!d || d.startsWith("(datetime")) return new Date().toLocaleString("fr-FR"); try { const dt = new Date(d); if (!isNaN(dt.getTime())) return dt.toLocaleString("fr-FR"); } catch {} const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(d); if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`; return d?.substring(0,16)||""; }

type ModificationLog = { field: string; oldValue: string | null; newValue: string | null };

function groupArticleModifications(logs: ModificationLog[]): Map<string, Set<string>> {
  const articleModifications = new Map<string, Set<string>>();
  const mark = (articleName: string, field: string) => {
    if (!articleModifications.has(articleName)) articleModifications.set(articleName, new Set());
    articleModifications.get(articleName)!.add(field);
  };

  for (const log of logs) {
    if (log.field === "Article renommé" && log.newValue) {
      mark(log.newValue, "articleName");
    } else if (log.field === "Article ajouté" && log.newValue) {
      mark(log.newValue, "added");
    } else if (log.field.startsWith("Qté ")) {
      mark(log.field.substring(4), "quantity");
    } else if (log.field.startsWith("Note ")) {
      mark(log.field.substring(5), "note");
    } else if (log.field.startsWith("Besoin ")) {
      mark(log.field.substring(7), "clientSpec");
    } else if (log.field.startsWith("Composant ajouté - ") || log.field.startsWith("Composant supprimé - ")) {
      const articleName = log.field.split(" - ").slice(1).join(" - ");
      if (articleName) mark(articleName, "technicalComponents");
    }
  }
  return articleModifications;
}

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
  // Visibilité des colonnes (admin) — défaut : toutes visibles (comportement historique)
  const [ff, setFf] = useState(""); // filtre par usine (unité de production)
  const [ftel, setFtel] = useState(false); // filtre famille télégestion
  const [factoryList, setFactoryList] = useState<{id:number;code:string;name:string}[]>([]);
  const [hiddenCols, setHiddenCols] = useState<string[]>([]);
  const [hiddenProdStates, setHiddenProdStates] = useState<string[]>([]);
  const [hideTotalRow, setHideTotalRow] = useState(false);
  const [showColMenu, setShowColMenu] = useState(false);
  // Incrémenté à chaque rafraîchissement : garde le regroupement par article à jour
  const [dataVersion, setDataVersion] = useState(0);
  // Alertes de recouvrement par client (affichées sur la colonne Client)
  const [recouvByClient, setRecouvByClient] = useState<Map<number, ClientRecouvrementAssignment>>(new Map());
  // Articles en cours de production d'après le planning (alerte visuelle)
  const [planningActiveItems, setPlanningActiveItems] = useState<Set<number>>(new Set());

  const [form, setForm] = useState({ orderNumber:"", orderDate:new Date().toISOString().split("T")[0], priority:"NORMALE" as string, clientId:"", agencyId:"", affaire:"", commercialStatus:"PREVISION" as string, productionStatus:"EN_INSTANCE" as string, cancelReason:"", statusReason:"" });
  const [formItems, setFormItems] = useState<OrderItem[]>([]);
  const [techItems, setTechItems] = useState<Record<number, Record<string,string>>>({});
  const [materialCategories, setMaterialCategories] = useState<MaterialCategory[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [itemMaterialSelections, setItemMaterialSelections] = useState<Record<number, number[]>>({});
  const [openTelegestionItem, setOpenTelegestionItem] = useState<number | null>(null);
  const [itemLoadingDates, setItemLoadingDates] = useState<Record<number, string>>({});
  
  // Cache des modifications par commande: Map<orderId, Map<articleName, Set<fieldType>>>
  const [orderModificationsCache, setOrderModificationsCache] = useState<Map<number, Map<string, Set<string>>>>(new Map());
  
  // Études photométriques
  // ÉVOLUTION §3-§21 : orderItemId = lien strict article ∈ commande ;
  // effectiveLens/lensSource/overridden = résolution backend (additifs).
  type PhotoStudyItem = { id?: number; orderItemId?: number | null; productName: string; lensId: string; lensReference?: string | null; lensLabel?: string | null; note: string; articleLens?: string | null; effectiveLens?: { reference: string; label: string } | null; lensSource?: "study" | "article" | null; overridden?: boolean };
  type PhotoStudy = { id: number; studyNumber: string; affaireName: string | null; orderId: number | null; clientId: number | null; clientName: string | null; note: string | null; createdByName: string; createdAt: string; documentCount?: number; studyDocument?: { driveFileId: string; fileName: string; mimeType: string | null } | null; items: PhotoStudyItem[] };
  const [showPhotoStudyModal, setShowPhotoStudyModal] = useState(false);
  const [photoStudyMode, setPhotoStudyMode] = useState<"order" | "standalone">("order");
  const [photoStudyForm, setPhotoStudyForm] = useState({ id: "", orderId: "", clientId: "", affaireName: "", studyNumber: "", note: "" });
  const [photoStudyItems, setPhotoStudyItems] = useState<PhotoStudyItem[]>([{ orderItemId: null, productName: "", lensId: "", note: "" }]);
  // ÉVOLUTION §3-§5 : articles de la commande sélectionnée (filtrage strict).
  const [studyOrderArticles, setStudyOrderArticles] = useState<ArticleOption[]>([]);
  const [studyArticlesLoading, setStudyArticlesLoading] = useState(false);
  const [studyInvalidatedMsg, setStudyInvalidatedMsg] = useState("");
  const [photoStudySaving, setPhotoStudySaving] = useState(false);
  const [editingStudy, setEditingStudy] = useState<PhotoStudy | null>(null);
  const [orderStudies, setOrderStudies] = useState<Map<number, PhotoStudy[]>>(new Map());
  const [standaloneStudies, setStandaloneStudies] = useState<PhotoStudy[]>([]);
  // ── Documents contextuels (Stockage Google Drive existant) ──
  // Cible du panneau de consultation/ajout (affaire ou étude)
  const [docsTarget, setDocsTarget] = useState<{ entity: "order" | "study"; id: number; label: string } | null>(null);
  // Fichiers en attente uploadés juste après l'enregistrement (flux « création »)
  const [pendingOrderDocs, setPendingOrderDocs] = useState<PendingDocument[]>([]);
  const [pendingStudyDocs, setPendingStudyDocs] = useState<PendingDocument[]>([]);
  
  // Hook pour les couleurs
  const { getModifiedCellStyle, getColor } = useColors();

  const ce=()=>["superadmin","commercial"].includes(user.role), ct=()=>["superadmin","technique"].includes(user.role), cp=()=>["superadmin","planification"].includes(user.role), cd=user.role==="superadmin";

  // ── Accès limité du service planification ──
  // Le planificateur peut CRÉER des commandes, mais uniquement à l'état
  // commercial « Sur Stock / Besoin interne » (verrouillé ici et côté serveur).
  // Il ne gagne aucun droit d'édition commerciale sur les commandes existantes.
  const planifStockOnly = user.role === "planification";
  const canCreateOrder = () => ce() || planifStockOnly;
  // Saisie de l'en-tête et des articles : commercial, ou planificateur en création
  const canEditOrderForm = () => ce() || (planifStockOnly && !editingOrder);

  // ── Visibilité des colonnes (config globale administrée par le superadmin) ──
  const isColVisible = (k:string):boolean => !hiddenCols.includes(k);
  const visibleColCount = ORDER_TABLE_TOTAL_COLS - ORDER_TABLE_COLUMNS.filter(c=>hiddenCols.includes(c.key)).length;
  const toggleColumn = async (key:string) => {
    const next = hiddenCols.includes(key) ? hiddenCols.filter(k=>k!==key) : [...hiddenCols, key];
    const prev = hiddenCols;
    setHiddenCols(next); // mise à jour optimiste
    try { await apiFetch("/api/orders/column-visibility", { method:"PUT", body: JSON.stringify({ hiddenColumns: next }) }); }
    catch (err) { setHiddenCols(prev); alert(err instanceof Error ? err.message : "Erreur d'enregistrement"); }
  };
  // Masquage de la ligne TOTAL des articles (admin)
  const toggleTotalRow = async () => {
    const next = !hideTotalRow;
    setHideTotalRow(next); // mise à jour optimiste
    try { await apiFetch("/api/orders/column-visibility", { method:"PUT", body: JSON.stringify({ hideTotalRow: next }) }); }
    catch (err) { setHideTotalRow(!next); alert(err instanceof Error ? err.message : "Erreur d'enregistrement"); }
  };
  // Masquage d'un état de production précis (le badge seulement, pas la colonne)
  const isProdStateVisible = (k:string):boolean => !hiddenProdStates.includes(k);
  const toggleProdState = async (key:string) => {
    const next = hiddenProdStates.includes(key) ? hiddenProdStates.filter(k=>k!==key) : [...hiddenProdStates, key];
    const prev = hiddenProdStates;
    setHiddenProdStates(next); // mise à jour optimiste
    try { await apiFetch("/api/orders/column-visibility", { method:"PUT", body: JSON.stringify({ hiddenProductionStates: next }) }); }
    catch (err) { setHiddenProdStates(prev); alert(err instanceof Error ? err.message : "Erreur d'enregistrement"); }
  };

  const fetchOrders = useCallback(async()=>{
    const p=new URLSearchParams();
    // Le filtre d'états est préfixé pour viser la bonne colonne :
    //   comm:*     → état commercial (orders.status)
    //   prod:*     → état de production (orders.productionStatus)
    //   planning:* → filtre côté client sur le planning de production
    if(fs.startsWith("comm:"))p.set("status",fs.slice(5));
    else if(fs.startsWith("prod:"))p.set("productionStatus",fs.slice(5));
    if(fa)p.set("agencyId",fa);
    if(fp)p.set("priority",fp);
    if(ff)p.set("factory",ff);
    if(ftel)p.set("telegestion","1");
    setOrders((await apiFetch<{orders:FullOrder[]}>(`/api/orders?${p}`)).orders);
    setDataVersion(v=>v+1)
  },[fs,fa,fp,ff,ftel]);
  useEffect(()=>{setLoading(true);Promise.all([
    fetchOrders(),
    apiFetch<{agencies:Agency[]}>("/api/agencies").then(d=>setAgencies(d.agencies)).catch(()=>{}),
    apiFetch<{clients:Client[]}>("/api/clients").then(d=>setClients(d.clients)).catch(()=>{}),
    apiFetch<{categories:MaterialCategory[]}>("/api/material-categories").then(d=>setMaterialCategories(d.categories.filter(category=>category.active))).catch(()=>{}),
    apiFetch<{matieres:Material[]}>("/api/matieres").then(d=>setMaterials(d.matieres)).catch(()=>{}),
    apiFetch<{hiddenColumns:string[];hiddenProductionStates?:string[];hideTotalRow?:boolean}>("/api/orders/column-visibility").then(d=>{setHiddenCols(d.hiddenColumns||[]);setHiddenProdStates(d.hiddenProductionStates||[]);setHideTotalRow(!!d.hideTotalRow)}).catch(()=>{}),
    apiFetch<{assignments:ClientRecouvrementAssignment[]}>("/api/recouvrement/client-states").then(d=>setRecouvByClient(new Map(d.assignments.map(a=>[a.clientId,a])))).catch(()=>{}),
    apiFetch<{itemIds:number[]}>("/api/production-planning/active").then(d=>setPlanningActiveItems(new Set(d.itemIds||[]))).catch(()=>{}),
    apiFetch<{factories:{id:number;code:string;name:string}[]}>("/api/factories").then(d=>setFactoryList(d.factories)).catch(()=>{}),
  ]).finally(()=>setLoading(false))},[fetchOrders]);
  // Planning actif : recalculé à chaque rafraîchissement des commandes (temps réel)
  const refreshPlanningActive=useCallback(async()=>{
    try{const d=await apiFetch<{itemIds:number[]}>("/api/production-planning/active");setPlanningActiveItems(new Set(d.itemIds||[]))}catch{/* non bloquant */}
  },[]);
  useEffect(()=>{if(dataVersion>0)refreshPlanningActive()},[dataVersion,refreshPlanningActive]);
  // Watch live auto-refresh
  useEffect(()=>{if(!watchLive)return;const iv=setInterval(fetchOrders,10000);return()=>clearInterval(iv)},[watchLive,fetchOrders]);
  // Auto-expand only the matching orders after the debounced search value changes.
  useEffect(() => {
    const query = normalizeOrderSearch(searchTerm);
    if (query.length < 2) return;
    const matchingIds = new Set(orders.filter((order) => orderMatchesSearch(order, query)).map((order) => order.id));
    if (matchingIds.size === 0) return;
    setExpandedOrders((previous) => {
      const unchanged = previous.size === matchingIds.size && [...matchingIds].every((id) => previous.has(id));
      return unchanged ? previous : matchingIds;
    });
  }, [searchTerm, orders]);

  // Charger les modifications d'une commande
  const loadOrderModifications = useCallback(async (orderId: number) => {
    if (orderModificationsCache.has(orderId)) return;
    try {
      const data = await apiFetch<{ logs: ModificationLog[] }>(`/api/order-modifications/${orderId}`);
      setOrderModificationsCache(prev => new Map(prev).set(orderId, groupArticleModifications(data.logs)));
    } catch (err) {
      console.error("Erreur chargement modifications:", err);
    }
  }, [orderModificationsCache]);

  // Le bouton « Tout déplier » charge par lots pour éviter une requête par
  // commande. La taille des lots évite aussi de construire une URL excessive
  // lorsque la liste filtrée contient beaucoup de commandes.
  const loadOrderModificationsBatch = useCallback(async (orderIds: number[]) => {
    const missingIds = [...new Set(orderIds)].filter((id) => !orderModificationsCache.has(id));
    const chunks: number[][] = [];
    for (let i = 0; i < missingIds.length; i += 100) chunks.push(missingIds.slice(i, i + 100));
    if (chunks.length === 0) return;

    const results = await Promise.all(chunks.map(async (ids) => {
      try {
        const data = await apiFetch<{ modifications: { orderId: number; logs: ModificationLog[] }[] }>(
          `/api/order-modifications?orderIds=${ids.join(",")}`,
        );
        return { data: data.modifications, failed: false };
      } catch (err) {
        console.error("Erreur chargement groupé des modifications:", err);
        return { data: [], failed: true };
      }
    }));

    setOrderModificationsCache((previous) => {
      const next = new Map(previous);
      for (const result of results) {
        if (result.failed) continue;
        for (const modification of result.data) {
          next.set(modification.orderId, groupArticleModifications(modification.logs));
        }
      }
      return next;
    });
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

  // Filtre et tri côté client. La recherche réduit réellement le nombre de
  // commandes montées dans le DOM ; auparavant elle ne faisait qu'ouvrir les
  // commandes correspondantes tout en conservant toutes les lignes affichées.
  const sortedOrders = useMemo(() => {
    const query = normalizeOrderSearch(searchTerm);
    let arr = query.length >= 2
      ? orders.filter((order) => orderMatchesSearch(order, query))
      : [...orders];
    if (fs === "planning:EN_COURS") {
      arr = arr.filter(o => (o.items || []).some(i => !!i.id && planningActiveItems.has(i.id)));
    } else if (fs === "planning:NONE") {
      arr = arr.filter(o => !(o.items || []).some(i => !!i.id && planningActiveItems.has(i.id)));
    }
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
  }, [orders, sortField, sortDir, fs, planningActiveItems, searchTerm]);

  // Empiler / Dépiler toutes les commandes en un clic.
  const allExpanded = sortedOrders.length > 0 && sortedOrders.every(o => expandedOrders.has(o.id));
  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedOrders(new Set());
    } else {
      const orderIds = sortedOrders.map(o => o.id);
      setExpandedOrders(new Set(orderIds));
      // Deux chargements groupés remplacent les 2 requêtes par commande.
      void Promise.all([
        loadOrderModificationsBatch(orderIds),
        loadStudiesForOrders(orderIds),
      ]);
    }
  };

  const rf=async()=>{try{const n=await apiFetch<{orderNumber:string}>("/api/orders/next-number");setForm({orderNumber:n.orderNumber,orderDate:new Date().toISOString().split("T")[0],priority:"NORMALE",clientId:"",agencyId:"",affaire:"",commercialStatus:planifStockOnly?"SUR_STOCK":"PREVISION",productionStatus:"EN_INSTANCE",cancelReason:"",statusReason:""})}catch{setForm({orderNumber:"",orderDate:new Date().toISOString().split("T")[0],priority:"NORMALE",clientId:"",agencyId:"",affaire:"",commercialStatus:planifStockOnly?"SUR_STOCK":"PREVISION",productionStatus:"EN_INSTANCE",cancelReason:"",statusReason:""})};setFormItems([]);setTechItems({});setItemMaterialSelections({});setOpenTelegestionItem(null);setEditingOrder(null);setError("");setSaving(false);setPendingOrderDocs([])};
  // Initialisation du formulaire pour une NOUVELLE commande : au moins une ligne
  // d'article prête à la saisie (le commercial disposait du bouton « + Ajouter »,
  // mais un formulaire vide sans aucune ligne n'est pas utilisable).
  const aiInit=()=>setFormItems([{articleName:"",quantity:1,unitPrice:"",description:""}]);

  const oe=async(o:FullOrder)=>{
    // Always fetch fresh data from API to get latest items + tech specs
    const fresh = await apiFetch<{order:FullOrder}>(`/api/orders/${o.id}`);
    const order = fresh.order;
    // Le formulaire technique doit connaître l'étude imposée avant d'afficher
    // la catégorie Lentille afin d'éviter une modification transitoire possible.
    await loadStudiesForOrder(order.id);
    setEditingOrder(order);
    setPendingOrderDocs([]);
    const prodStatus = order.productionStatus || "EN_INSTANCE";
    setForm({orderNumber:order.orderNumber,orderDate:order.orderDate,priority:order.priority,clientId:String(order.clientId),agencyId:String(order.agencyId),affaire:order.affaire||"",commercialStatus:order.status||"PREVISION",productionStatus:order.productionStatus||"EN_INSTANCE",cancelReason:order.cancelReason||"",statusReason:order.statusReason||""});
    setFormItems(order.items&&order.items.length>0?order.items.map(i=>({id:i.id,articleName:i.articleName,quantity:i.quantity,unitPrice:i.unitPrice||"",description:i.description||"",note:i.note||"",clientSpec:i.clientSpec||"",isTelegestion:!!i.isTelegestion,productionUnit:i.productionUnit||"",plannedLoadingDate:i.plannedLoadingDate||""})):[{articleName:"",quantity:1,unitPrice:"",description:""}]);
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
    // Commercial : création + modification. Planification : CRÉATION uniquement,
    // et toujours à l'état « Sur Stock / Besoin interne » (revérifié côté serveur).
    if(canEditOrderForm()){
      if(vi.length===0&&!editingOrder){setError("Au moins un article");setSaving(false);return}
      const statusToSend=planifStockOnly?"SUR_STOCK":(form.commercialStatus||"BON_COMMANDE");
      const pl:Record<string,unknown>={orderDate:form.orderDate,priority:"NORMALE",clientId:parseInt(form.clientId),agencyId:parseInt(form.agencyId),affaire:form.affaire||null,status:statusToSend,items:vi.map(i=>({id:i.id||undefined,articleName:i.articleName,quantity:i.quantity||1,note:i.note||null,clientSpec:i.clientSpec||null,isTelegestion:!!i.isTelegestion,unitPrice:i.unitPrice||null,description:i.description||null}))};
      // Ajouter orderNumber seulement pour les modifications
      if(editingOrder){pl.orderNumber=form.orderNumber;}
      if(form.commercialStatus==="ANNULEE"&&form.cancelReason)pl.cancelReason=form.cancelReason;
      let savedOrderId=editingOrder?.id;
      if(editingOrder){await apiFetch(`/api/orders/${editingOrder.id}`,{method:"PUT",body:JSON.stringify(pl)})}else{const created=await apiFetch<{order:FullOrder}>("/api/orders",{method:"POST",body:JSON.stringify(pl)});savedOrderId=created.order?.id;}
      for(const item of vi){try{await apiFetch("/api/library/articles",{method:"POST",body:JSON.stringify({name:item.articleName})})}catch{}}
      // Documents en attente : envoyés vers Google Drive puis associés à la
      // commande (jamais l'inverse — aucune association fictive en cas d'échec)
      if(pendingOrderDocs.length>0&&savedOrderId){
        const up=await uploadPendingDocuments("order",savedOrderId,pendingOrderDocs);
        if(up.failed.length>0)alert(`Commande enregistrée, mais ${up.failed.length} document(s) n'ont pas pu être envoyés :\n`+up.failed.map(f=>`• ${f.name}: ${f.reason}`).join("\n"));
        setPendingOrderDocs([]);
      }
    }
    if(ct()&&editingOrder){
      const dynamicTechItems=(editingOrder.items||[]).filter(item=>item.id).map(item=>({itemId:item.id!,materialIds:itemMaterialSelections[item.id!]||[]}));
      await apiFetch(`/api/orders/${editingOrder.id}`,{method:"PUT",body:JSON.stringify({dynamicTechItems})});
    }
    if(cp()&&editingOrder){
      // Send per-item productionUnit + plannedLoadingDate
      // L'unité de production n'est plus envoyée depuis ce formulaire : elle est
      // pilotée par l'usine choisie dans le planning de production.
      const itemUpdates = Object.keys(itemLoadingDates).map(k => ({itemId: parseInt(k), plannedLoadingDate: itemLoadingDates[parseInt(k)] || undefined}));
      await apiFetch(`/api/orders/${editingOrder.id}`,{method:"PUT",body:JSON.stringify({priority:form.priority,productionStatus:form.productionStatus,statusReason:form.statusReason,cancelReason:form.cancelReason,itemUpdates})});
    }
    setShowModal(false);rf();fetchOrders()}catch(err:unknown){setError(err instanceof Error?err.message:"Erreur");setSaving(false)}};

  const hd=async(id:number)=>{if(!confirm("Supprimer?"))return;await apiFetch(`/api/orders/${id}`,{method:"DELETE"});fetchOrders()};
  const showExpeditionHistory = useCallback(async (itemId: number) => {
    setExpItemId(itemId);
    const d = await apiFetch<{ batches: ExpeditionBatch[] }>(`/api/expedition/${itemId}`);
    setExpBatches(d.batches);
    setShowExpHistory(true);
  }, []);
  const showModifications=async(orderId:number)=>{setModOrderId(orderId);const d=await apiFetch<{logs:typeof modLogs}>(`/api/order-modifications/${orderId}`);setModLogs(d.logs);setShowModHistory(true)};
  const ee=async()=>{const p=new URLSearchParams();if(fs.startsWith("comm:"))p.set("status",fs.slice(5));if(fa)p.set("agencyId",fa);const res=await fetch(`/api/orders/export?${p}`,{credentials:"same-origin"});if(!res.ok){alert("Erreur export");return}const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`commandes_${new Date().toISOString().split("T")[0]}.xlsx`;a.click();URL.revokeObjectURL(url)};
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
  const loadStudiesForOrders = useCallback(async (orderIds: number[]) => {
    const missingIds = [...new Set(orderIds)].filter((id) => !orderStudies.has(id));
    const chunks: number[][] = [];
    for (let i = 0; i < missingIds.length; i += 100) chunks.push(missingIds.slice(i, i + 100));
    if (chunks.length === 0) return;

    const results = await Promise.all(chunks.map(async (ids) => {
      try {
        const data = await apiFetch<{ studies: PhotoStudy[] }>(
          `/api/photometric-studies?orderIds=${ids.join(",")}`,
        );
        return { ids, studies: data.studies, failed: false };
      } catch {
        return { ids, studies: [] as PhotoStudy[], failed: true };
      }
    }));

    setOrderStudies((previous) => {
      const next = new Map(previous);
      for (const result of results) {
        if (result.failed) continue;
        const studiesByOrder = new Map<number, PhotoStudy[]>();
        for (const study of result.studies) {
          if (study.orderId !== null) {
            const studies = studiesByOrder.get(study.orderId) || [];
            studies.push(study);
            studiesByOrder.set(study.orderId, studies);
          }
        }
        for (const orderId of result.ids) next.set(orderId, studiesByOrder.get(orderId) || []);
      }
      return next;
    });
  }, [orderStudies]);

  const loadStudiesForOrder = useCallback(async (orderId: number, force = false): Promise<PhotoStudy[]> => {
    if (!force && orderStudies.has(orderId)) return orderStudies.get(orderId) || [];
    try {
      const d = await apiFetch<{ studies: PhotoStudy[] }>(`/api/photometric-studies?orderId=${orderId}`);
      setOrderStudies(prev => new Map(prev).set(orderId, d.studies));
      return d.studies;
    } catch {
      return [];
    }
  }, [orderStudies]);

  const openPhotoStudyModal = (study?: PhotoStudy) => {
    if (study) {
      setEditingStudy(study);
      setPhotoStudyForm({ id: String(study.id), orderId: study.orderId ? String(study.orderId) : "", clientId: study.clientId ? String(study.clientId) : "", affaireName: study.affaireName || "", studyNumber: study.studyNumber, note: study.note || "" });
      // §18 : récupérer la lentille existante, conserver l'override (lensId renvoyé tel quel).
      setPhotoStudyItems(study.items.length > 0 ? study.items.map(i => ({ orderItemId: i.orderItemId ?? null, productName: i.productName, lensId: i.lensId ? String(i.lensId) : "", lensReference: i.lensReference ?? null, lensLabel: i.lensLabel ?? null, note: i.note || "" })) : [{ orderItemId: null, productName: "", lensId: "", note: "" }]);
      setPhotoStudyMode(study.orderId ? "order" : "standalone");
    } else {
      setEditingStudy(null);
      setPhotoStudyForm({ id: "", orderId: "", clientId: "", affaireName: "", studyNumber: "", note: "" });
      setPhotoStudyItems([{ orderItemId: null, productName: "", lensId: "", note: "" }]);
      setPhotoStudyMode("order");
      setStudyOrderArticles([]);
    }
    setStudyInvalidatedMsg("");
    setPendingStudyDocs([]);
    setShowPhotoStudyModal(true);
    setError("");
  };

  const savePhotoStudy = async () => {
    if (!photoStudyForm.studyNumber.trim()) { setError("N° d'étude requis"); return; }
    if (photoStudyMode === "order" && !photoStudyForm.orderId) { setError("Sélectionnez une commande"); return; }
    if (photoStudyMode === "standalone" && !photoStudyForm.affaireName.trim()) { setError("Saisissez le nom de l'affaire"); return; }
    // §3 : en mode commande, chaque ligne DOIT être un article de la commande
    // (liste contrôlée — le backend re-vérifie et le serveur fait foi pour le nom).
    if (photoStudyMode === "order" && photoStudyItems.some(i => !i.orderItemId)) { setError("Chaque produit doit être un article de la commande sélectionnée"); return; }
    const validItems = photoStudyMode === "order"
      ? photoStudyItems.filter(i => i.orderItemId)
      : photoStudyItems.filter(i => i.productName.trim());
    if (validItems.length === 0) { setError("Au moins un produit requis"); return; }
      setPhotoStudySaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        studyNumber: photoStudyForm.studyNumber,
        note: photoStudyForm.note,
        clientId: photoStudyForm.clientId || null,
        items: validItems.map(i => ({ orderItemId: i.orderItemId ?? null, productName: i.productName, lensId: i.lensId ? parseInt(i.lensId) : null, note: i.note })),
      };
      if (photoStudyMode === "order") payload.orderId = photoStudyForm.orderId;
      else payload.affaireName = photoStudyForm.affaireName;

      let savedStudyId = editingStudy?.id;
      if (editingStudy) {
        payload.id = editingStudy.id;
        await apiFetch("/api/photometric-studies", { method: "PUT", body: JSON.stringify(payload) });
      } else {
        const created = await apiFetch<{ study: PhotoStudy }>("/api/photometric-studies", { method: "POST", body: JSON.stringify(payload) });
        savedStudyId = created.study?.id;
      }
      // Documents joints au formulaire : upload Google Drive puis association
      // automatique à l'étude (en cas d'échec, l'étude reste enregistrée et le
      // message détaille précisément les fichiers non envoyés).
      if (pendingStudyDocs.length > 0 && savedStudyId) {
        const up = await uploadPendingDocuments("study", savedStudyId, pendingStudyDocs);
        if (up.failed.length > 0) alert(`Étude enregistrée, mais ${up.failed.length} document(s) n'ont pas pu être envoyés :\n` + up.failed.map(f => `• ${f.name}: ${f.reason}`).join("\n"));
        setPendingStudyDocs([]);
      }
      // Recharger immédiatement le cache affiché après l'enregistrement.
      // L'ancienne version supprimait seulement l'entrée du cache : une ligne
      // d'étude pouvait donc rester absente jusqu'au prochain dépliage.
      if (photoStudyMode === "order" && photoStudyForm.orderId) {
        await loadStudiesForOrder(parseInt(photoStudyForm.orderId), true);
      }
      if (photoStudyMode === "standalone") {
        await fetchStandaloneStudies();
      }
      setShowPhotoStudyModal(false);
      setEditingStudy(null);
      await fetchOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPhotoStudySaving(false);
    }
  };

  const deletePhotoStudy = async (studyId: number) => {
    if (!confirm("Supprimer cette étude photométrique ?")) return;
    const linkedOrderId = [...orderStudies.entries()]
      .find(([, studies]) => studies.some(study => study.id === studyId))?.[0] || null;
    try {
      await apiFetch("/api/photometric-studies", { method: "DELETE", body: JSON.stringify({ id: studyId }) });
      if (linkedOrderId !== null) {
        await loadStudiesForOrder(linkedOrderId, true);
      } else {
        await fetchStandaloneStudies();
      }
      await fetchOrders();
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

  const lensMaterials = useMemo(() => {
    const lensCategory = materialCategories.find(c => c.key === "lens" || c.name.toLowerCase().includes("lentille"));
    return lensCategory ? materials.filter(m => m.categoryId === lensCategory.id) : [];
  }, [materialCategories, materials]);

  // L'API renvoie les études par dernière modification décroissante. Une seule
  // étude est retenue par article : une étude récente sans lentille neutralise
  // l'imposition d'une étude plus ancienne, au lieu de laisser apparaître une
  // lentille historique par erreur.
  const studyLensByItem = useMemo(() => {
    const result = new Map<number, PhotoStudyItem | null>();
    if (!editingOrder) return result;
    for (const study of orderStudies.get(editingOrder.id) || []) {
      for (const studyItem of study.items) {
        if (studyItem.orderItemId == null || result.has(studyItem.orderItemId)) continue;
        result.set(studyItem.orderItemId, studyItem.lensId || studyItem.lensReference ? studyItem : null);
      }
    }
    return result;
  }, [editingOrder, orderStudies]);

  // Si une ancienne ligne Lentille existe déjà, synchroniser son identifiant
  // dans le payload technique : la sauvegarde remplacera la même ligne au lieu
  // d'ajouter un second composant. Sans ligne historique, la lentille reste
  // affichée depuis l'étude/order_items.lens sans insertion artificielle.
  useEffect(() => {
    if (!editingOrder || studyLensByItem.size === 0) return;
    const lensCategoryIds = new Set(materialCategories
      .filter(category => category.key === "lens" || category.name.toLowerCase().includes("lentille"))
      .map(category => category.id));
    if (lensCategoryIds.size === 0) return;

    setItemMaterialSelections(previous => {
      const next = { ...previous };
      let changed = false;
      for (const item of editingOrder.items || []) {
        if (!item.id) continue;
        const studyLens = studyLensByItem.get(item.id);
        const forcedLensId = studyLens?.lensId ? parseInt(studyLens.lensId) : null;
        const hasExistingLensLine = (item.technicalComponents || []).some(component =>
          component.categoryKey === "lens" || (component.categoryId !== null && lensCategoryIds.has(component.categoryId)),
        );
        if (!forcedLensId || !hasExistingLensLine) continue;
        const current = next[item.id] || [];
        const kept = current.filter(id => !lensCategoryIds.has(id));
        const nextIds = kept.includes(forcedLensId) ? kept : [...kept, forcedLensId];
        if (nextIds.length !== current.length || nextIds.some((id, index) => id !== current[index])) {
          next[item.id] = nextIds;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [editingOrder, studyLensByItem, materialCategories]);

  // ── ÉVOLUTION ÉTUDES §3-§5 : articles strictement ∈ commande sélectionnée ──
  // Au changement de commande : recharger les articles, invalider les lignes
  // devenues hors périmètre (jamais Commande B + article de Commande A),
  // et relier automatiquement les lignes historiques par nom exact.
  useEffect(() => {
    if (!showPhotoStudyModal || photoStudyMode !== "order" || !photoStudyForm.orderId) {
      if (!photoStudyForm.orderId) {
        setStudyOrderArticles([]);
        // Commande effacée : invalider toutes les lignes liées.
        setPhotoStudyItems(prev => {
          if (!prev.some(l => l.orderItemId)) return prev;
          setStudyInvalidatedMsg("⚠ Commande effacée : les articles sélectionnés ont été invalidés.");
          return prev.map(l => ({ ...l, orderItemId: null }));
        });
      }
      return;
    }
    let cancelled = false;
    (async () => {
      setStudyArticlesLoading(true);
      try {
        const d = await apiFetch<{ items: ArticleOption[] }>(`/api/orders/${photoStudyForm.orderId}/items`);
        if (cancelled) return;
        const list = d.items || [];
        setStudyOrderArticles(list);
        setPhotoStudyItems(prev => {
          // 1) Invalider les lignes hors périmètre (changement de commande).
          const cleaned = sanitizeItemsOnOrderChange(
            prev.map(l => ({ ...l, orderItemId: l.orderItemId ?? null })),
            list
          );
          const dropped = prev.filter((l, i) => l.orderItemId && !cleaned[i].orderItemId).length;
          // 2) Relier les lignes historiques (nom exact, insensible à la casse).
          // 3) Backfiller productName depuis l'article (cohérence d'affichage).
          const byId = new Map(list.map(a => [a.id, a]));
          const next = cleaned.map(l => {
            if (!l.orderItemId && l.productName.trim()) {
              const name = l.productName.trim().toLowerCase();
              const matches = list.filter(a => a.articleName.trim().toLowerCase() === name);
              if (matches.length === 1) return { ...l, orderItemId: matches[0].id, productName: matches[0].articleName };
            }
            if (l.orderItemId && byId.has(l.orderItemId)) {
              const a = byId.get(l.orderItemId)!;
              if (l.productName !== a.articleName) return { ...l, productName: a.articleName };
            }
            return l;
          });
          if (dropped > 0) {
            setStudyInvalidatedMsg(`⚠ Commande changée : ${dropped} article(s) n'appartiennent pas à cette commande et ont été invalidés.`);
          }
          return next;
        });
      } catch {
        if (!cancelled) setStudyOrderArticles([]);
      } finally {
        if (!cancelled) setStudyArticlesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showPhotoStudyModal, photoStudyMode, photoStudyForm.orderId]);

  // Options de recherche (listes contrôlées + SearchSelect).
  const studyOrderOptions: SearchOption[] = useMemo(() =>
    orders.map(o => ({ id: o.id, label: o.orderNumber, sub: `${o.affaire || "Sans affaire"} · ${o.clientName || "Sans client"}` })),
  [orders]);
  const studyLensOptions: SearchOption[] = useMemo(() =>
    lensMaterials.map(m => ({ id: m.id, label: `${m.reference} — ${m.name}`, sub: m.specs || undefined })),
  [lensMaterials]);
  const studyArticleOptions: SearchOption[] = useMemo(() =>
    studyOrderArticles.map(a => ({
      id: a.id,
      label: `${a.reference ? `${a.reference} · ` : ""}${a.articleName}`,
      sub: `Qté ${a.quantity}${a.lens ? ` · Lentille article : ${a.lens}` : " · Sans lentille article"}`,
    })),
  [studyOrderArticles]);

  // Badge de priorité : couleur pilotée par le gestionnaire de couleurs
  // (clés PRIORITY_P1…P10 + valeurs historiques), texte contrasté automatiquement.
  const priorityBadgeStyle=(p:string):React.CSSProperties=>{
    const bg=getColor(priorityColorKey(p));
    return { backgroundColor:bg, color:getContrastTextColor(bg), borderColor:darkenColor(bg,20), borderWidth:"1px", borderStyle:"solid" };
  };
  const commercialBadge=(status:string)=>status==="SUR_STOCK"?"bg-cyan-300 border-cyan-700":status==="BON_COMMANDE"?"bg-blue-300 border-blue-700":"bg-[#FFD3AC] border-orange-600";
  const productionBadge=(state:string,productionStatus?:string|null)=>state==="cancelled"?"bg-[#FF2C2C] border-[#B81F1F]":state==="delivered"?"bg-green-400 border-green-800":state==="awaiting-delivery"?"bg-[#FFF700] border-[#B8A900]":productionStatus==="EN_PRODUCTION"?"bg-yellow-300 border-yellow-700":"bg-violet-300 border-violet-700";
  const orderRowClass=(state:string,commercialStatus:string)=>state==="neutral"&&commercialStatus==="PREVISION"?"bg-[#FFD3AC] hover:bg-[#ffc28c] border-orange-600":ORDER_STATE_ROW_CLASSES[state as keyof typeof ORDER_STATE_ROW_CLASSES];
  const orderPanelClass=(state:string,commercialStatus:string)=>state==="neutral"&&commercialStatus==="PREVISION"?"bg-[#FFD3AC] border-orange-600":ORDER_STATE_PANEL_CLASSES[state as keyof typeof ORDER_STATE_PANEL_CLASSES];
  const highlight = useCallback((text: string) => {
    if (!searchTerm || searchTerm.length < 2) return text;
    const query = searchTerm.toLowerCase();
    const idx = text.toLowerCase().indexOf(query);
    if (idx < 0) return text;
    return <>{text.slice(0, idx)}<mark className="bg-yellow-300 dark:bg-yellow-500 text-black px-0.5 rounded">{text.slice(idx, idx + searchTerm.length)}</mark>{text.slice(idx + searchTerm.length)}</>;
  }, [searchTerm]);
  const photometricLensColor = getColor("ETUDE_PHOTOMETRIQUE");
  const photometricLensTextColor = getContrastTextColor(photometricLensColor);

  return (<div className="space-y-3 operational-content">
    <div className="flex flex-wrap gap-2 items-center">
      <select value={fs} onChange={e=>setFs(e.target.value)} title="Filtrer par état commercial, état de production ou suivi du planning"
        className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
        <option value="">Tous les états</option>
        <optgroup label="État commercial">
          <option value="comm:SUR_STOCK">📦 Sur Stock / Besoin interne</option>
          <option value="comm:BON_COMMANDE">📋 Bon de commande</option>
          <option value="comm:PREVISION">🟠 Prévision</option>
        </optgroup>
        <optgroup label="État de production">
          <option value="prod:EN_INSTANCE">🟣 En instance</option>
          <option value="prod:EN_PRODUCTION">🟡 En production</option>
          <option value="prod:LIVREE">🟢 Livrée</option>
          <option value="prod:ANNULEE">🔴 Annulée</option>
        </optgroup>
        <optgroup label="Planning de production">
          <option value="planning:EN_COURS">🏭 En cours de production (planning)</option>
          <option value="planning:NONE">⚪ Hors planning</option>
        </optgroup>
      </select>
      <select value={fa} onChange={e=>setFa(e.target.value)} className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"><option value="">Agences</option>{agencies.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <select value={ff} onChange={e=>setFf(e.target.value)} title="Filtrer par usine (unité de production)"
        className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
        <option value="">🏭 Usines</option>
        {factoryList.map(f=><option key={f.id} value={f.name}>{f.name} ({f.code})</option>)}
      </select>
      <select value={fp} onChange={e=>setFp(e.target.value)} className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
        <option value="">Priorités</option>
        {PRIORITY_OPTIONS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
        {/* Valeurs historiques encore présentes dans les données */}
        <option value="URGENTE">Urgente (ancien)</option>
        <option value="TRES_URGENTE">Très Urgente (ancien)</option>
      </select>
      <label className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer flex items-center gap-1.5 border transition-colors ${ftel?"bg-sky-100 border-sky-500 text-sky-800 font-semibold":"bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"}`}
        title="N’afficher que les commandes contenant des articles de la famille Télégestion">
        <input type="checkbox" checked={ftel} onChange={e=>setFtel(e.target.checked)} className="accent-sky-600" />📡 Télégestion
      </label>
      <button onClick={fetchOrders} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-300">🔄 Actualiser</button>
      <label className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer flex items-center gap-1 transition-colors ${watchLive?"bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-400":"bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-300 dark:border-gray-600"}`}>
        <input type="checkbox" checked={watchLive} onChange={e=>setWatchLive(e.target.checked)} className="sr-only" />
        <span className={`w-2 h-2 rounded-full ${watchLive?"bg-green-500 animate-pulse":""}`}></span>📡 Live
      </label>
      <DebouncedSearchInput value={searchTerm} onChange={setSearchTerm} />
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
      {cd&&<div className="relative">
        <button onClick={()=>setShowColMenu(v=>!v)} title="Afficher / masquer des colonnes (admin)"
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Colonnes
        </button>
        {showColMenu&&<>
          <div className="fixed inset-0 z-40" onClick={()=>setShowColMenu(false)} />
          <div className="absolute right-0 z-50 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-2 max-h-[70vh] overflow-y-auto">
            <div className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Colonnes visibles</div>
            {ORDER_TABLE_COLUMNS.map(c=>(
              <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={!hiddenCols.includes(c.key)} onChange={()=>toggleColumn(c.key)} className="accent-blue-600" />
                {c.label}
              </label>
            ))}
            <div className="px-2 py-1.5 mt-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-t border-gray-100 dark:border-gray-700 pt-2">États de production affichés</div>
            {PRODUCTION_STATE_OPTIONS.map(s=>(
              <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={isProdStateVisible(s.key)} onChange={()=>toggleProdState(s.key)} className="accent-blue-600" />
                {s.label}
              </label>
            ))}
            <div className="px-2 py-1.5 mt-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-t border-gray-100 dark:border-gray-700 pt-2">Affichage du détail</div>
            <label className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={!hideTotalRow} onChange={toggleTotalRow} className="accent-blue-600" />
              Ligne TOTAL des articles
            </label>
            <div className="px-2 pt-1.5 pb-1 text-[10px] text-gray-400 border-t border-gray-100 dark:border-gray-700 mt-1">Masquer un état cache uniquement son badge, pas la ligne ni la colonne. Configuration appliquée à tous les utilisateurs.</div>
          </div>
        </>}
      </div>}
      <div className="flex-1"/>
      <button onClick={()=>setShowImport(true)} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">📥 Import</button>
      <button onClick={ee} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">📤 Export</button>
      {ct()&&<button onClick={()=>openPhotoStudyModal()} className="px-4 py-1.5 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700">🔬 Nouvelle Étude Photométrique</button>}
      {canCreateOrder()&&<button onClick={()=>{rf();aiInit();setShowModal(true)}} title={planifStockOnly?"Créer une commande Sur Stock / Besoin interne":"Créer une commande"} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Nouvelle{planifStockOnly?" (Sur Stock)":""}</button>}
    </div>

    {loading?<div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg></div>:
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-gray-50 dark:bg-gray-800 border-b text-left">
      <th className="px-2 py-2 w-6"></th><th className="px-2 py-2 font-semibold text-gray-600">N°</th>{isColVisible("date")&&<th className="px-2 py-2 font-semibold text-gray-600">Date</th>}<th className="px-2 py-2 font-semibold text-gray-600">Client</th>{isColVisible("agence")&&<th className="px-2 py-2 font-semibold text-gray-600">Agence</th>}{isColVisible("affaire")&&<th className="px-2 py-2 font-semibold text-gray-600">Affaire</th>}{isColVisible("priorite")&&<th className="px-2 py-2 font-semibold text-gray-600">Priorité</th>}{isColVisible("etatComm")&&<th className="px-2 py-2 font-semibold text-gray-600">État Comm.</th>}<th className="px-2 py-2 font-semibold text-gray-600">État Prod.</th>{isColVisible("creePar")&&<th className="px-2 py-2 font-semibold text-gray-600">Créé par</th>}{isColVisible("modifiePar")&&<th className="px-2 py-2 font-semibold text-gray-600">Modifié par</th>}<th className="px-2 py-2"></th>
    </tr></thead><tbody>
    {sortedOrders.length===0?<tr><td colSpan={visibleColCount} className="text-center py-12 text-black">Aucune commande</td></tr>:
    sortedOrders.map(o=>{
      const expanded=expandedOrders.has(o.id);
      const ordered=o.items?.reduce((sum,item)=>sum+item.quantity,0)||o.totalQty||0;
      const produced=o.items?.reduce((sum,item)=>sum+(item.producedQty||0),0)||o.totalProduced||0;
      const delivered=o.items?.reduce((sum,item)=>sum+(item.deliveredQty||0),0)||o.totalDelivered||0;
      const visualState=getOrderVisualState({productionStatus:o.productionStatus,ordered,produced,delivered});
      const operationalLabel=visualState==="neutral"?(o.productionStatus==="EN_PRODUCTION"?"En production":"En instance"):ORDER_STATE_LABELS[visualState];
      return (<React.Fragment key={o.id}><tr className={`cursor-pointer border-l-4 text-black [&_td]:text-black [&_span]:text-black [&_b]:text-black ${orderRowClass(visualState,o.status)}`} onClick={()=>toggleExpand(o.id)}>
        <td className="px-2 py-1.5 text-center font-bold">{expanded?"▾":"▸"}</td>
        <td className="px-2 py-1.5 font-medium">{highlight(o.orderNumber)}{(o.items||[]).some(i=>!!i.id&&planningActiveItems.has(i.id))&&<span className="planning-blink ml-1 inline-block px-1 text-[8px] font-bold align-middle" style={{["--planning-color"]:getColor("PLANNING_EN_COURS"),["--planning-text"]:"#000000"} as React.CSSProperties} title="Production en cours (planning)">PROD</span>}{(o.documentCount||0)>0&&<span onClick={(e)=>{e.stopPropagation();setDocsTarget({entity:"order",id:o.id,label:o.orderNumber})}} className={`ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-bold align-middle border cursor-pointer rounded ${o.hasCahierDesCharges?"doc-blink bg-blue-100 border-blue-500 text-blue-900":"bg-blue-50 border-blue-300 text-blue-800"}`} title={o.hasCahierDesCharges?"Cahier des charges disponible":"Documents disponibles"}>📄 {o.hasCahierDesCharges?"Cahier des charges":"Docs"}{o.documentCount!>1?` (${o.documentCount})`:""}</span>}</td>
        {isColVisible("date")&&<td className="px-2 py-1.5 text-[10px]">{o.orderDate}</td>}
        <td className="px-2 py-1.5"><RecouvrementAlertCell name={highlight(o.clientName||"")} assignment={recouvByClient.get(o.clientId)} /></td>
        {isColVisible("agence")&&<td className="px-2 py-1.5 text-[10px]">{o.agencyName}</td>}
        {isColVisible("affaire")&&<td className="px-2 py-1.5 text-[10px] font-medium">{highlight(o.affaire||"-")}</td>}
        {isColVisible("priorite")&&<td className="px-2 py-1.5"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={priorityBadgeStyle(o.priority)}>{priorityLabel(o.priority)}</span></td>}
        {isColVisible("etatComm")&&<td className="px-2 py-1.5"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${commercialBadge(o.status)}`}>{o.status==="SUR_STOCK"?"Stock":o.status==="BON_COMMANDE"?"Bon de commande":"Prévision"}</span></td>}
        <td className="px-2 py-1.5" title={o.statusReason||""}>{isProdStateVisible(productionStateKey(visualState,o.productionStatus))?<><span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${productionBadge(visualState,o.productionStatus)}`}>{operationalLabel}</span>{o.statusReason&&<span className="text-[8px] ml-1 cursor-help">💬</span>}{visualState==="cancelled"&&o.cancelReason&&<span className="text-[9px] ml-1">({o.cancelReason})</span>}</>:<span className="text-[10px] opacity-40">—</span>}</td>
        {isColVisible("creePar")&&<td className="px-2 py-1.5 text-[10px]">{o.createdByName||"-"}</td>}
        {isColVisible("modifiePar")&&<td className="px-2 py-1.5 text-[10px] flex items-center gap-1">{o.updatedBy||"-"}<button onClick={(e)=>{e.stopPropagation();showModifications(o.id)}} className="text-[11px]" title="Historique des modifications">📝</button></td>}
        <td className="px-2 py-1.5 text-right" onClick={e=>e.stopPropagation()}><button onClick={()=>oe(o)} className="px-2 py-1 text-[10px] bg-white/70 border border-black/30 text-black rounded">Détails</button>{cd&&<button onClick={()=>hd(o.id)} className="ml-1 px-2 py-1 text-[10px] bg-white/70 border border-black/30 text-black rounded">✕</button>}</td>
      </tr>
      {expanded&&o.items&&o.items.length>0&&<tr key={`${o.id}-exp`} className={`text-black [&_td]:text-black [&_span]:text-black [&_b]:text-black ${orderPanelClass(visualState,o.status)}`}><td colSpan={visibleColCount} className="px-2 py-2">
        <DeferredOrderDetails estimatedHeight={Math.max(180, o.items.length * 42 + 80)}>
          {() => (
        <table className="w-full text-[11px] border-collapse"><thead><tr className="text-left text-black border-b border-black/30">
          <th className="px-1 py-1">Article</th><th className="px-1 py-1">Cmd</th><th className="px-1 py-1">Unité</th><th className="px-1 py-1">Prod</th><th className="px-1 py-1">Livré</th><th className="px-1 py-1">Stock</th><th className="px-1 py-1">Reste à livrer</th>
          <th className="px-1 py-1">Besoin</th><th className="px-1 py-1">Spécs Tech</th><th className="px-1 py-1">Note</th><th className="px-1 py-1">Expéd</th>
        </tr></thead><tbody>
        {o.items!.map(it => (
          <OrderItemRow
            key={it.id}
            item={it}
            orderId={o.id}
            visualState={visualState as OrderVisualState}
            modifications={orderModificationsCache.get(o.id)}
            highlight={highlight}
            fmtDate={fmtDate}
            onShowExpeditionHistory={showExpeditionHistory}
            planningInProgress={!!it.id&&planningActiveItems.has(it.id)}
            studyLens={!!it.id && (() => {
              const imposed = latestStudyItemForOrderItem(orderStudies.get(o.id) || [], it.id!);
              return !!imposed && !!(imposed.lensReference || imposed.lensId);
            })()}
          />
        ))}
        {!hideTotalRow&&<tr className="bg-white/60 text-[10px] text-black"><td className="px-1 py-1 font-semibold">TOTAL</td><td className="px-1 py-1">{ordered}</td><td className="px-1 py-1"></td><td className="px-1 py-1">{produced}</td><td className="px-1 py-1">{delivered}</td><td className="px-1 py-1">{Math.max(0,produced-delivered)}</td><td className="px-1 py-1"><span className="remaining-to-deliver">{Math.max(0,ordered-delivered)}</span></td><td className="px-1 py-1" colSpan={4}></td></tr>}
        {/* Études photométriques de cette commande */}
        {(orderStudies.get(o.id) || []).map(study => (
          <React.Fragment key={`study-${study.id}`}>
            <tr className="border-b border-black/10" style={{ backgroundColor: getColor("ETUDE_PHOTOMETRIQUE"), color: "#000" }}>
              <td className="px-1 py-1.5 text-[10px] font-bold" colSpan={2}>🔬 Étude #{study.studyNumber}{(study.documentCount||0)>0&&<><button onClick={(e)=>{e.stopPropagation();setDocsTarget({entity:"study",id:study.id,label:study.studyNumber})}} className="ml-1.5 doc-blink inline-flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-bold bg-blue-100 border border-blue-500 rounded text-blue-900 align-middle cursor-pointer" title="Afficher les documents associés">📎 Étude dispo</button>{study.studyDocument&&<a href={documentDownloadUrl(study.studyDocument.driveFileId,"attachment")} download onClick={e=>e.stopPropagation()} className="ml-1 inline-flex items-center px-1 py-0.5 text-[10px] font-bold text-blue-700 hover:text-blue-900 align-middle" title={`Télécharger ${study.studyDocument.fileName}`}>⬇</a>}</>}</td>
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
                <td className="px-1 py-1 text-[10px]" colSpan={2}>{si.lensReference ? <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold" style={{ backgroundColor: photometricLensColor, color: photometricLensTextColor }}><b>{si.lensReference}</b>{si.overridden ? <span title="Imposée par l'étude photométrique (priorité sur la spécification article)">🔒</span> : ""}</span> : (si.effectiveLens ? <span className="italic text-sky-800">défaut: {si.effectiveLens.reference}</span> : "")}</td>
                <td className="px-1 py-1 text-[10px]" colSpan={2}>{si.lensLabel || <span className="italic text-gray-600">—</span>}</td>
                <td className="px-1 py-1 text-[9px]" colSpan={4}>{si.note || ""}</td>
              </tr>
            ))}
          </React.Fragment>
        ))}
        </tbody></table>
          )}
        </DeferredOrderDetails>
      </td></tr>}
      </React.Fragment>)})}
    </tbody></table></div></div>}

    {showModal&&(<div className="fixed inset-0 z-50 flex items-start justify-center pt-4 pb-4 overflow-y-auto"><div className="absolute inset-0 bg-black/50" onClick={()=>setShowModal(false)}/><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl mx-2 max-h-[94vh] overflow-y-auto">
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b px-5 py-3 rounded-t-2xl flex justify-between z-10"><div><h3 className="text-lg font-semibold text-gray-800 dark:text-white">{editingOrder?`N°${editingOrder.orderNumber}`:"Nouvelle Commande"}</h3>{editingOrder?.createdByName&&<span className="text-xs text-gray-500">Créée par {editingOrder.createdByName}</span>}{editingOrder?.updatedBy&&<span className="text-xs text-gray-500 ml-3">Modifié par {editingOrder.updatedBy}</span>}</div><button onClick={()=>setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button></div>
      <div className="p-5 space-y-5">{error&&<div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* COMMERCIAL : visible pour le commercial (création + modification) et pour
          le planificateur EN CRÉATION (accès limité « Sur Stock / Besoin interne »).
          Pour les autres rôles (technique, planification en modification), le fieldset
          n'apparaît qu'en consultation d'une commande existante (editingOrder). */}
      {(canEditOrderForm()||editingOrder)&&<fieldset className="border border-blue-200 dark:border-blue-800 rounded-xl p-4 bg-blue-50/30 dark:bg-blue-900/10"><legend className="text-sm font-bold text-blue-700 px-2">📋 COMMERCIAL</legend>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
        {/* N° Commande - Lecture seule, généré automatiquement */}
        <div>
          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">N° Commande</label>
          <div className={`w-full px-3 py-2 border rounded-lg text-sm font-bold ${editingOrder ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-blue-50 border-blue-300 text-blue-700"}`}>
            {editingOrder ? form.orderNumber : (form.orderNumber || "Auto-généré")}
          </div>
          {!editingOrder && <span className="text-[10px] text-blue-600 mt-0.5 block">Format: N/AAAA (ex: 1/2026)</span>}
        </div>
        <F l="Date" type="date" v={form.orderDate} onChange={v=>setForm({...form,orderDate:v})} disabled={!canEditOrderForm()}/>
        {/* État initial : 3 choix pour le commercial */}
        <div><label className="block text-[11px] font-medium text-gray-600 mb-1">État initial</label>
          {/* Le planificateur est verrouillé sur « Sur Stock / Besoin interne » :
              le bouton ne bascule pas (contrôle également appliqué côté serveur). */}
          <button type="button" onClick={()=>{if(planifStockOnly)return;setForm({...form,commercialStatus:form.commercialStatus==="BON_COMMANDE"?"PREVISION":form.commercialStatus==="PREVISION"?"SUR_STOCK":"BON_COMMANDE"})}} disabled={(!ce()&&!!editingOrder)||planifStockOnly}
            title={planifStockOnly?"Le service planification ne peut créer que des commandes « Sur Stock / Besoin interne »":"Cliquer pour changer l'état initial"}
            className={`w-full px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${form.commercialStatus==="SUR_STOCK"?"bg-cyan-100 border-cyan-400 text-cyan-800":form.commercialStatus==="BON_COMMANDE"?"bg-blue-100 border-blue-400 text-blue-800":"bg-orange-100 border-orange-400 text-orange-800"} ${planifStockOnly?"opacity-90 cursor-not-allowed":""}`}>
            {form.commercialStatus==="SUR_STOCK"?"📦 Sur Stock / Besoin interne":form.commercialStatus==="BON_COMMANDE"?"📋 Bon de Commande reçu":"🔮 Prévision"}
            {planifStockOnly&&<span className="block text-[9px] font-normal opacity-70">🔒 État imposé au service planification</span>}
          </button>
        </div>
        <AutocompleteSelect label="Client *" items={clients.map(c=>({id:c.id,label:c.name}))} value={form.clientId} onChange={v=>setForm({...form,clientId:v})} disabled={!canEditOrderForm()} />
        <AutocompleteSelect label={form.commercialStatus==="SUR_STOCK"?"Agence (facultative)":"Agence *"} items={agencies.map(a=>({id:a.id,label:a.name}))} value={form.agencyId} onChange={v=>setForm({...form,agencyId:v})} disabled={!canEditOrderForm()} />
        <div><label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">N° Affaire</label><AutocompleteInput value={form.affaire} onChange={v=>setForm({...form,affaire:v})} suggestUrl="/api/library/affaires" placeholder="Affaire" disabled={!canEditOrderForm()} /></div>
      </div>
      {canEditOrderForm()&&<div className="mt-4">
      <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-2">Articles</label>
      {/* Header labels */}
      <div className="hidden md:flex gap-2 mb-1 px-0.5">
        <span className="flex-[3] text-[10px] font-semibold text-gray-500 dark:text-gray-400">Article</span>
        <span className="w-20 text-[10px] font-semibold text-gray-500 dark:text-gray-400 text-center">Quantité</span>
        <span className="flex-[2] text-[10px] font-semibold text-gray-500 dark:text-gray-400">Besoin client</span>
        <span className="flex-[2] text-[10px] font-semibold text-gray-500 dark:text-gray-400">Note</span>
        <span className="text-[10px] font-semibold text-sky-700 whitespace-nowrap">📡 Télégestion</span>
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
          {/* Famille TÉLÉGESTION : coché par le commercial dès la saisie */}
          <label className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded border border-sky-300 bg-sky-50 cursor-pointer select-none"
            title="Cet article appartient à la famille Télégestion">
            <input type="checkbox" checked={!!item.isTelegestion}
              onChange={e=>ui(idx,"isTelegestion",e.target.checked as unknown as string)} className="accent-sky-600" />
            <span className="text-[11px] font-medium text-sky-800 whitespace-nowrap">📡 Télégestion</span>
          </label>
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
        const studyLens=studyLensByItem.get(it.id!);
        const hasStudyLens=!!studyLens && !!(studyLens.lensId || studyLens.lensReference);
        const studyLensId=studyLens?.lensId ? parseInt(studyLens.lensId) : null;
        const studyLensMaterialId=studyLensId || (studyLens?.lensReference
          ? lensMaterials.find(material=>material.reference.toLowerCase()===studyLens.lensReference!.toLowerCase())?.id || null
          : null);
        const articleLensMaterialId=it.lens
          ? lensMaterials.find(material=>material.reference.toLowerCase()===it.lens!.trim().toLowerCase())?.id || null
          : null;
        return <div key={it.id} className="mb-4 border-2 border-gray-300 rounded-xl p-4 bg-white text-black">
          <div className="flex items-center justify-between gap-3 mb-3"><div><div className="font-bold text-base text-black">{it.articleName}</div><div className="text-xs text-black">Quantité commandée : {it.quantity}</div></div>
            {telegestionCategory&&<button type="button" onClick={()=>setOpenTelegestionItem(openTelegestionItem===it.id?null:it.id!)} className="px-3 py-2 rounded-lg border-2 border-sky-700 bg-sky-200 text-black text-xs font-bold">📡 Options de télégestion ({selectedIds.filter(id=>telegestionMaterials.some(material=>material.id===id)).length})</button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {normalCategories.map(category=>{
              const categoryMaterials=materials.filter(material=>material.categoryId===category.id);
              const isLensCategory=category.key === "lens" || category.name.toLowerCase().includes("lentille");
              const selected=isLensCategory && hasStudyLens
                ? studyLensMaterialId
                : isLensCategory
                  ? articleLensMaterialId || selectedIds.find(id=>categoryMaterials.some(material=>material.id===id)) || null
                  : selectedIds.find(id=>categoryMaterials.some(material=>material.id===id)) || null;
              return <CategoryMaterialSelect
                key={category.id}
                categoryId={category.id}
                categoryName={isLensCategory && hasStudyLens ? `${category.name} 🔒 (étude photométrique)` : category.name}
                selectedMaterialId={selected}
                selectedMaterial={selected ? materials.find(material=>material.id===selected) || null : null}
                disabled={isLensCategory && hasStudyLens}
                onSelect={(materialId)=>{
                  if (isLensCategory && hasStudyLens) return;
                  selectCategoryMaterial(it.id!,category.id,materialId);
                }}
              />})}
          </div>
          {openTelegestionItem===it.id&&telegestionCategory&&<div className="mt-3 rounded-xl border-2 border-sky-600 bg-sky-50 p-3"><div className="font-bold text-black mb-2">Accessoires de télégestion à ajouter</div>
            {telegestionMaterials.length===0?<p className="text-xs text-black">Aucun accessoire. Ajoutez-les d&apos;abord dans Table Matières → Accessoire de télégestion.</p>:<div className="grid grid-cols-1 md:grid-cols-2 gap-2">{telegestionMaterials.map(material=><label key={material.id} className="flex items-start gap-2 rounded-lg border border-sky-300 bg-white p-2 cursor-pointer"><input type="checkbox" checked={selectedIds.includes(material.id)} onChange={()=>toggleTelegestionMaterial(it.id!,material.id)} className="mt-0.5"/><span className="text-xs text-black"><b>{material.reference}</b> — {material.name}<br/><span>Stock indicatif : {material.stock}</span></span></label>)}</div>}
          </div>}
        </div>})}
      </fieldset>}

      {cp()&&editingOrder&&<fieldset className="border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 bg-emerald-50/30 dark:bg-emerald-900/10"><legend className="text-sm font-bold text-emerald-700 px-2">📅 PLANIFICATION</legend>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Priorité</label>
          <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} className="w-full px-2 py-2 bg-white border rounded-lg text-sm">
            {PRIORITY_OPTIONS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
            {/* Conserve la valeur historique de la commande si elle n'est plus proposée */}
            {form.priority&&!PRIORITY_OPTIONS.some(p=>p.value===form.priority)&&(
              <option value={form.priority}>{PRIORITY_LABELS[form.priority]||form.priority} (ancien)</option>
            )}
          </select>
          <p className="text-[10px] text-gray-500 mt-1">Priorité 1 = la plus urgente. À la fin de production d&apos;une commande, les suivantes remontent automatiquement d&apos;un niveau.</p>
        </div>
        <div><label className="block text-[11px] font-medium text-gray-600 mb-1">État</label><select value={form.productionStatus} onChange={e=>setForm({...form,productionStatus:e.target.value})} className="w-full px-2 py-2 bg-white border rounded-lg text-sm"><option value="EN_INSTANCE">🟣 En instance</option><option value="EN_PRODUCTION">🟡 En production</option><option value="LIVREE">🟢 Livrée</option><option value="ANNULEE">🔴 Annulée</option></select></div>
        <div><F l="Motif changement" v={form.statusReason} onChange={v=>setForm({...form,statusReason:v})}/></div>
        {form.productionStatus==="ANNULEE"&&<div className="md:col-span-2"><F l="Cause annulation" v={form.cancelReason} onChange={v=>setForm({...form,cancelReason:v})}/></div>}
      </div>
      <div className="text-xs font-medium text-gray-600 mb-2">Unité Production par article :</div>
      {/* L'unité de production n'est plus saisie ici : elle est désormais
          déterminée par l'USINE choisie dans l'onglet « Planning production ».
          Elle reste affichée (lecture seule) et continue d'apparaître dans le
          tableau des commandes et l'export, comme auparavant. */}
      {editingOrder.items?.filter(i=>i.id).map(it=><div key={it.id} className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-gray-600 w-24 truncate">{it.articleName}</span>
        <span className="flex-1 px-2 py-1 border border-gray-200 bg-gray-50 rounded text-xs text-gray-600" title="Usine définie lors de la planification de production">
          🏭 {it.productionUnit || <span className="italic text-gray-400">Usine non planifiée</span>}
        </span>
      </div>)}
      </fieldset>}

      </div>
      {/* DOCUMENTS DE L&apos;AFFAIRE — réutilise le module Stockage (Google Drive) existant.
          En modification : upload/lien immédiat ; en création : les fichiers sont
          mis en attente puis envoyés juste après l'enregistrement de la commande. */}
      {(editingOrder||["superadmin","commercial","technique"].includes(user.role))&&<fieldset className="border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 bg-indigo-50/30 dark:bg-indigo-900/10"><legend className="text-sm font-bold text-indigo-700 dark:text-indigo-300 px-2">📎 DOCUMENTS DE L&apos;AFFAIRE</legend>
        {editingOrder?(
          <DocumentsPanel entity="order" entityId={editingOrder.id} user={user}
            canAdd={["superadmin","commercial","technique"].includes(user.role)}
            defaultCategory="CAHIER_DES_CHARGES" onChanged={fetchOrders} />
        ):(<>
          <PendingDocumentsZone pending={pendingOrderDocs} onChange={setPendingOrderDocs}
            defaultCategory="CAHIER_DES_CHARGES" title="Cahier des charges / documents du projet" />
          <p className="text-[10px] text-gray-400 mt-1">Envoyés sur Google Drive (onglet Stockage) puis associés automatiquement à la commande à l&apos;enregistrement.</p>
        </>)}
      </fieldset>}

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
        {/* Cas 1 : Sélection d'une commande existante (recherche intelligente, liste contrôlée) */}
        {photoStudyMode==="order" && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Commande * (recherche : n°, affaire, client)</label>
            <SearchSelect options={studyOrderOptions} value={photoStudyForm.orderId ? parseInt(photoStudyForm.orderId) : null}
              onChange={id => { setStudyInvalidatedMsg(""); setPhotoStudyForm({ ...photoStudyForm, orderId: id ? String(id) : "" }); }}
              placeholder="Taper pour rechercher une commande… (ex. 125, stade, tunis)" emptyText="Aucune commande trouvée" />
            {studyInvalidatedMsg && <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-[12px] font-semibold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">{studyInvalidatedMsg}</p>}
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
        {/* Produits (N articles) — ÉVOLUTION : articles ∈ commande + override lentille */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            Produits Concernés *{photoStudyMode === "order" && photoStudyForm.orderId && (
              <span className="font-normal"> — {studyArticlesLoading ? "chargement…" : `${studyOrderArticles.length} article(s) dans cette commande (filtrage strict)`}</span>
            )}
          </label>
          <div className="hidden md:flex gap-2 mb-1 px-0.5 text-[10px] font-semibold text-gray-500">
            <span className="flex-[3]">{photoStudyMode === "order" ? "Article (commande uniquement)" : "Produit"}</span>
            <span className="flex-[2]">Lentille imposée par l&apos;étude</span>
            <span className="flex-[2]">Note produit</span>
            <span className="w-7"></span>
          </div>
          <div className="space-y-2">
            {photoStudyItems.map((si, idx) => {
              const article = studyOrderArticles.find(a => a.id === (si.orderItemId ?? null)) || null;
              const studyLensMat = si.lensId ? lensMaterials.find(m => m.id === parseInt(si.lensId)) || null : null;
              const studyLens = studyLensMat
                ? { reference: studyLensMat.reference, label: studyLensMat.name }
                : (si.lensReference ? { reference: si.lensReference, label: si.lensLabel || "" } : null);
              const resolved = resolveStudyLens(articleLensToValue(article?.lens), studyLens);
              const badge = lensSourceBadge(resolved.source);
              return (
              <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                <div className="flex gap-2 items-center">
                  <div className="flex-[3] min-w-0">
                    {photoStudyMode === "order" ? (
                      <SearchSelect options={studyArticleOptions} value={si.orderItemId ?? null}
                        onChange={id => { const u = [...photoStudyItems]; const art = studyOrderArticles.find(a => a.id === id); u[idx] = { ...u[idx], orderItemId: id, productName: art ? art.articleName : "" }; setPhotoStudyItems(u); }}
                        placeholder={!photoStudyForm.orderId ? "Sélectionnez d'abord une commande" : "Taper : net, apollo, NLX100…"}
                        disabled={!photoStudyForm.orderId || studyArticlesLoading} loading={studyArticlesLoading}
                        emptyText={!photoStudyForm.orderId ? "Aucune commande sélectionnée" : "Aucun article dans cette commande"} />
                    ) : (
                      <AutocompleteInput value={si.productName} onChange={v => { const u = [...photoStudyItems]; u[idx] = { ...u[idx], productName: v }; setPhotoStudyItems(u); }}
                        suggestUrl="/api/library/articles" placeholder="Nom du produit"/>
                    )}
                  </div>
                  <div className="flex-[2] min-w-0">
                    <SearchSelect options={studyLensOptions} value={si.lensId ? parseInt(si.lensId) : null}
                      onChange={id => { const u = [...photoStudyItems]; u[idx] = { ...u[idx], lensId: id ? String(id) : "" }; setPhotoStudyItems(u); }}
                      placeholder="Lentille : LENS-B, intensive…" emptyText="Aucune lentille trouvée" />
                  </div>
                  <div className="flex-[2] min-w-0">
                    <input type="text" value={si.note} onChange={e => { const u = [...photoStudyItems]; u[idx] = { ...u[idx], note: e.target.value }; setPhotoStudyItems(u); }}
                      placeholder="Note" className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm"/>
                  </div>
                  <div className="w-7 shrink-0 flex justify-center">
                    {photoStudyItems.length > 1 && <button onClick={() => setPhotoStudyItems(photoStudyItems.filter((_, i) => i !== idx))} className="p-1 text-red-500 hover:text-red-700 text-sm">✕</button>}
                  </div>
                </div>
                {photoStudyMode === "order" && article?.lens && (
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    Spec article : <strong>{article.lens}</strong>
                    {article.lensBy ? ` (par ${article.lensBy}${article.lensAt ? `, ${article.lensAt}` : ""})` : ""}
                  </p>
                )}
                {(resolved.effective || si.lensId) && (
                  <div className="mt-1.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${resolved.source === "study" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : resolved.source === "article" ? "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200" : "bg-gray-100 text-gray-500"}`}>
                      {resolved.effective ? `Lentille applicable : ${resolved.effective.reference}` : "Aucune lentille"} · {badge.text}
                    </span>
                  </div>
                )}
                {resolved.overridden && (
                  <div className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[12px] leading-snug text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                    ⚠️ {LENS_OVERRIDE_MESSAGE}
                  </div>
                )}
              </div>
              );
            })}
          </div>
          <button onClick={() => setPhotoStudyItems([...photoStudyItems, { orderItemId: null, productName: "", lensId: "", note: "" }])} className="mt-2 text-xs text-sky-600 hover:underline">+ Ajouter un produit</button>
          {lensMaterials.length === 0 && <p className="text-[10px] text-amber-600 mt-1">Aucune lentille dans la table Matières.</p>}
        </div>

        {/* Étude photométrique / Document associé — module Stockage existant.
            En modification : ajout immédiat ; en création : upload après enregistrement. */}
        {editingStudy ? (
          <div className="border border-sky-200 dark:border-sky-800 rounded-xl p-3 bg-sky-50/40 dark:bg-sky-900/10">
            <DocumentsPanel entity="study" entityId={editingStudy.id} user={user}
              canAdd={["superadmin","technique"].includes(user.role)}
              title="Étude photométrique / Document associé"
              defaultCategory="ETUDE_PHOTOMETRIQUE" />
          </div>
        ) : (
          <PendingDocumentsZone pending={pendingStudyDocs} onChange={setPendingStudyDocs}
            defaultCategory="ETUDE_PHOTOMETRIQUE"
            title="Étude photométrique / Document associé (PDF, plan…)"/>
        )}
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
                    <td className="px-2 py-1.5 font-bold text-[11px] text-black">🔬 {study.studyNumber}{(study.documentCount||0)>0&&<span className="block mt-0.5"><button onClick={(e)=>{e.stopPropagation();setDocsTarget({entity:"study",id:study.id,label:study.studyNumber})}} className="doc-blink inline-flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-bold bg-blue-100 border border-blue-500 rounded text-blue-900 cursor-pointer" title="Afficher les documents associés">📎 Étude disponible</button>{study.studyDocument&&<a href={documentDownloadUrl(study.studyDocument.driveFileId,"attachment")} download onClick={e=>e.stopPropagation()} className="ml-1 inline-flex items-center px-1 py-0.5 text-[10px] font-bold text-blue-700 hover:text-blue-900" title={`Télécharger ${study.studyDocument.fileName}`}>⬇</a>}</span>}</td>
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
                        <div key={idx} className="mb-0.5">{si.lensReference ? <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold" style={{ backgroundColor: photometricLensColor, color: photometricLensTextColor }}><b>{si.lensReference}</b> — {si.lensLabel}{si.overridden ? <span title="Imposée par l'étude photométrique (priorité sur la spécification article)">🔒</span> : ""}</span> : (si.effectiveLens ? <span className="italic text-sky-800">défaut: {si.effectiveLens.reference}</span> : <span className="text-gray-400">—</span>)}</div>
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

    {/* ═══════════════════════════════════════════════════════════════════ */}
    {/* SECTION 3 : Regroupement par Article (3 premiers caractères)       */}
    {/* Placé sous les études photométriques, toujours à jour via          */}
    {/* dataVersion (incrémenté à chaque rafraîchissement des commandes).  */}
    {/* ═══════════════════════════════════════════════════════════════════ */}
    <ArticleGroupingView filters={{ status: fs, agency: fa, priority: fp }} refreshKey={dataVersion} />
    {/* MODAL DOCUMENTS CONTEXTUELS — consultation/ajout depuis l'indicateur 📄/📎.
        Réutilise DocumentsPanel (et donc le Stockage Google Drive existant). */}
    {docsTarget&&(
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e=>e.stopPropagation()}>
        <div className="absolute inset-0 bg-black/50" onClick={()=>setDocsTarget(null)}/>
        <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[80vh] overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-semibold text-gray-800 dark:text-white">
              📄 {docsTarget.entity==="order"?`Documents — Commande #${docsTarget.label}`:`Documents — Étude ${docsTarget.label}`}
            </h4>
            <button onClick={()=>setDocsTarget(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <DocumentsPanel entity={docsTarget.entity} entityId={docsTarget.id} user={user}
            canAdd={docsTarget.entity==="order"?["superadmin","commercial","technique"].includes(user.role):["superadmin","technique"].includes(user.role)}
            defaultCategory={docsTarget.entity==="study"?"ETUDE_PHOTOMETRIQUE":"AUTRE"}
            onChanged={()=>{fetchOrders();fetchStandaloneStudies();}} />
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
