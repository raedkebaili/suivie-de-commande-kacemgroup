"use client";

/**
 * Panneau « Documents contextuels » — RÉUTILISE le module Stockage existant.
 *
 * - Upload : POST /api/documents (multipart) → fichier rangé dans la racine
 *   Google Drive « ORDERTRACK STORAGE » (sous-dossiers AFFAIRES / ETUDES
 *   PHOTOMETRIQUES) → visible dans l'onglet Stockage.
 * - Lien : POST /api/documents (mode link) → associe un fichier Drive déjà
 *   présent dans le Stockage (évite les doublons physiques).
 * - Téléchargement / visualisation : route existante
 *   GET /api/storage/download/[id] (aucune duplication de logique).
 * - Dissociation : DELETE /api/documents/[id] — le fichier reste dans Stockage.
 *
 * Utilisé depuis : la fiche affaire (OrdersView), l'onglet Télégestion et le
 * formulaire d'étude photométrique.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Download, Eye, FilePlus2, FileSpreadsheet, FileText, File as FileIcon,
  FileImage, HardDrive, Link2, Loader2, Search, Trash2, UploadCloud, X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MAX_SIZE,
  documentCategoryLabel,
  documentExtensionAllowed,
  type DocumentEntityType,
  type LinkedDocument,
} from "@/lib/document-categories";

// ────────────────────────────────────────────────────────────────────────────
// Helpers partagés
// ────────────────────────────────────────────────────────────────────────────

function fileIconFor(name: string, mime: string | null): React.ReactNode {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") return <FileText className="w-4 h-4 text-red-600" />;
  if (/\.(xls|xlsx|csv)$/.test(lower)) return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
  if (/\.(png|jpg|jpeg)$/.test(lower)) return <FileImage className="w-4 h-4 text-sky-600" />;
  if (/\.(doc|docx|txt)$/.test(lower)) return <FileText className="w-4 h-4 text-blue-600" />;
  return <FileIcon className="w-4 h-4 text-gray-500" />;
}

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return ""; }
}

/** Lien de téléchargement via la route de Stockage EXISTANTE */
export function documentDownloadUrl(driveFileId: string, mode: "attachment" | "inline" = "attachment"): string {
  return `/api/storage/download/${encodeURIComponent(driveFileId)}?mode=${mode}`;
}

/** Upload séquentiel de documents en attente (flux « création » des formulaires) */
export async function uploadPendingDocuments(
  entity: DocumentEntityType,
  entityId: number,
  pending: { file: File; category: string }[],
): Promise<{ uploaded: number; failed: { name: string; reason: string }[] }> {
  const failed: { name: string; reason: string }[] = [];
  let uploaded = 0;
  for (const p of pending) {
    try {
      const fd = new FormData();
      fd.append("entity", entity);
      fd.append("entityId", String(entityId));
      fd.append("category", p.category);
      fd.append("file", p.file);
      await apiFetch("/api/documents", { method: "POST", body: fd });
      uploaded++;
    } catch (err) {
      failed.push({ name: p.file.name, reason: err instanceof Error ? err.message : "Erreur d'upload" });
    }
  }
  return { uploaded, failed };
}

// ────────────────────────────────────────────────────────────────────────────
// Zone de sélection de fichiers en attente (utilisée AVANT la création de
// l'entité : la commande/l'étude n'a pas encore d'identifiant — les fichiers
// sont uploadés juste après l'enregistrement via uploadPendingDocuments).
// ────────────────────────────────────────────────────────────────────────────

export type PendingDocument = { file: File; category: string };

export function PendingDocumentsZone({ pending, onChange, defaultCategory = "AUTRE", title }: {
  pending: PendingDocument[];
  onChange: (docs: PendingDocument[]) => void;
  defaultCategory?: string;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = [...pending];
    for (const f of Array.from(files)) {
      if (!documentExtensionAllowed(f.name)) continue;
      if (f.size <= 0 || f.size > DOCUMENT_MAX_SIZE) continue;
      if (next.some(p => p.file.name === f.name && p.file.size === f.size)) continue;
      next.push({ file: f, category: defaultCategory });
    }
    onChange(next);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{title || "Documents associés"}</label>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={e => { e.preventDefault(); setDrag(false); }}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-3 text-center text-xs transition-colors ${
          drag ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700" : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-500 hover:border-blue-400"
        }`}>
        <UploadCloud className="w-5 h-5 mx-auto mb-1 opacity-70" />
        Glissez-déposez vos fichiers ici ou <span className="font-semibold text-blue-600">cliquez pour sélectionner</span>
        <span className="block text-[10px] mt-0.5 opacity-70">PDF, XLS, XLSX, DOC, DOCX, PNG, JPG — max 50 Mo/fichier</span>
        <input ref={inputRef} type="file" multiple className="hidden"
          accept=".pdf,.xls,.xlsx,.doc,.docx,.png,.jpg,.jpeg,.csv,.txt"
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {pending.length > 0 && (
        <ul className="mt-2 space-y-1">
          {pending.map((p, i) => (
            <li key={`${p.file.name}-${i}`} className="flex items-center gap-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5">
              {fileIconFor(p.file.name, p.file.type)}
              <span className="truncate flex-1 text-gray-700 dark:text-gray-200">{p.file.name}</span>
              <select value={p.category}
                onChange={e => { const next = [...pending]; next[i] = { ...next[i], category: e.target.value }; onChange(next); }}
                className="text-[10px] px-1.5 py-0.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded">
                {DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{documentCategoryLabel(c)}</option>)}
              </select>
              <button type="button" onClick={() => onChange(pending.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500" title="Retirer">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <p className="text-[10px] text-amber-600 mt-1">
          {pending.length} fichier(s) seront envoyés vers Google Drive à l&apos;enregistrement.
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Panneau principal
// ────────────────────────────────────────────────────────────────────────────

export default function DocumentsPanel({ entity, entityId, user, canAdd, title, defaultCategory = "AUTRE", onChanged, compact = false }: {
  entity: DocumentEntityType;
  entityId: number;
  user: User;
  canAdd: boolean;
  title?: string;
  defaultCategory?: string;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const [documents, setDocuments] = useState<LinkedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ documents: LinkedDocument[] }>(`/api/documents?entity=${entity}&id=${entityId}`);
      setDocuments(d.documents);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement des documents");
    } finally { setLoading(false); }
  }, [entity, entityId]);

  useEffect(() => { load(); }, [load]);

  const isAdmin = user.role === "superadmin";
  const canUnlink = (doc: LinkedDocument) => isAdmin || doc.uploadedById === user.id;

  const unlink = async (doc: LinkedDocument) => {
    if (!window.confirm(`Retirer « ${doc.fileName} » de cette ${entity === "order" ? "affaire" : "étude"} ?\nLe fichier restera disponible dans l'onglet Stockage.`)) return;
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      await load();
      onChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de la dissociation");
    }
  };

  return (
    <div className={compact ? "" : "space-y-2"}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-blue-600" />
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
            {title || (entity === "order" ? "Documents de l'affaire" : "Document associé")}
          </h4>
          {!loading && (
            <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-1.5 py-0.5 rounded-full">{documents.length}</span>
          )}
        </div>
        {canAdd && (
          <button type="button" onClick={e => { e.stopPropagation(); setAddOpen(true); }}
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[11px] font-medium hover:bg-blue-700">
            <FilePlus2 className="w-3.5 h-3.5" /> Ajouter un document
          </button>
        )}
      </div>

      {error && <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-gray-400 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des documents…</div>
      ) : documents.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic py-1">Aucun document associé.</p>
      ) : (
        <ul className={`divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 ${compact ? "text-[11px]" : "text-xs"}`}>
          {documents.map(doc => (
            <li key={doc.id} className="flex items-center gap-2 px-2.5 py-2">
              {fileIconFor(doc.fileName, doc.mimeType)}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-gray-800 dark:text-gray-100" title={doc.fileName}>{doc.fileName}</div>
                <div className="text-[10px] text-gray-400 flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-blue-700">{documentCategoryLabel(doc.category)}</span>
                  {doc.fileSize ? <span>• {formatSize(doc.fileSize)}</span> : null}
                  <span>• {formatDate(doc.createdAt)}</span>
                  <span>• par {doc.uploadedByName}</span>
                </div>
              </div>
              <a href={documentDownloadUrl(doc.driveFileId, "attachment")} download
                onClick={e => e.stopPropagation()}
                className="p-1.5 text-gray-400 hover:text-blue-600" title="Télécharger (Google Drive)">
                <Download className="w-4 h-4" />
              </a>
              {doc.mimeType === "application/pdf" || /\.(png|jpe?g)$/i.test(doc.fileName) ? (
                <a href={documentDownloadUrl(doc.driveFileId, "inline")} target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="p-1.5 text-gray-400 hover:text-emerald-600" title="Visualiser">
                  <Eye className="w-4 h-4" />
                </a>
              ) : null}
              {canUnlink(doc) && (
                <button type="button" onClick={e => { e.stopPropagation(); unlink(doc); }}
                  className="p-1.5 text-gray-400 hover:text-red-500" title="Retirer l'association (le fichier reste dans Stockage)">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {addOpen && (
        <AddDocumentModal
          entity={entity} entityId={entityId} user={user}
          defaultCategory={defaultCategory}
          onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modale d'ajout : nouveau fichier (upload) OU fichier existant du Stockage
// ────────────────────────────────────────────────────────────────────────────

type DriveFileEntry = { id: string; name: string; mimeType: string; isFolder: boolean; size: number | null; modifiedTime: string | null };

function AddDocumentModal({ entity, entityId, user, defaultCategory, onClose, onDone }: {
  entity: DocumentEntityType;
  entityId: number;
  user: User;
  defaultCategory: string;
  onClose: () => void;
  onDone: (msg?: string) => void;
}) {
  const [tab, setTab] = useState<"upload" | "existing">("upload");
  const [category, setCategory] = useState(defaultCategory);
  const [error, setError] = useState("");

  // Upload
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Lien vers un fichier existant du Stockage
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DriveFileEntry[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const pickFile = (f: File | undefined | null) => {
    setError("");
    if (!f) return;
    if (!documentExtensionAllowed(f.name)) { setError("Format non accepté (PDF, XLS, XLSX, DOC, DOCX, PNG, JPG, CSV, TXT)"); return; }
    if (f.size <= 0) { setError("Fichier vide"); return; }
    if (f.size > DOCUMENT_MAX_SIZE) { setError("Fichier trop volumineux (max 50 Mo)"); return; }
    setFile(f);
  };

  const doUpload = async () => {
    if (!file || uploading) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("entity", entity);
      fd.append("entityId", String(entityId));
      fd.append("category", category);
      fd.append("file", file);
      await apiFetch("/api/documents", { method: "POST", body: fd });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
      setUploading(false);
    }
  };

  const searchStorage = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (q.trim().length >= 2) params.set("q", q.trim());
      params.set("pageSize", "25");
      // Route EXISTANTE du module Stockage — aucune duplication de logique
      const d = await apiFetch<{ files: DriveFileEntry[] }>(`/api/storage/files?${params}`);
      setResults((d.files || []).filter(f => !f.isFolder));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de recherche dans le Stockage");
      setResults([]);
    } finally { setSearching(false); }
  }, []);

  useEffect(() => {
    if (tab !== "existing") return;
    const t = setTimeout(() => searchStorage(search), 300);
    return () => clearTimeout(t);
  }, [search, tab, searchStorage]);

  const doLink = async (f: DriveFileEntry) => {
    if (linkingId) return;
    setLinkingId(f.id); setError("");
    try {
      await apiFetch("/api/documents", {
        method: "POST",
        body: JSON.stringify({ mode: "link", entity, entityId, category, driveFileId: f.id }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'association");
      setLinkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={e => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-5 py-3 flex items-center justify-between rounded-t-2xl z-10">
          <h4 className="text-base font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-600" /> Ajouter un document
          </h4>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Onglets : nouveau fichier / existant (évite les doublons) */}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setTab("upload"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${tab === "upload" ? "bg-blue-100 border-blue-500 text-blue-800" : "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"}`}>
              <UploadCloud className="w-3.5 h-3.5" /> Nouveau fichier
            </button>
            <button type="button" onClick={() => { setTab("existing"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${tab === "existing" ? "bg-emerald-100 border-emerald-500 text-emerald-800" : "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"}`}>
              <Link2 className="w-3.5 h-3.5" /> Depuis le Stockage
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Type de document</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
              {DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{documentCategoryLabel(c)}</option>)}
            </select>
          </div>

          {error && <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>}

          {tab === "upload" ? (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={e => { e.preventDefault(); setDrag(false); }}
                onDrop={e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center text-xs transition-colors ${
                  drag ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700" : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-500 hover:border-blue-400"
                }`}>
                <UploadCloud className="w-8 h-8 mx-auto mb-2 opacity-60" />
                {file ? (
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{file.name} <span className="font-normal opacity-70">({formatSize(file.size)})</span></span>
                ) : (
                  <>Glissez-déposez le fichier ici ou <span className="font-semibold text-blue-600">sélectionnez-le depuis votre PC</span></>
                )}
                <input ref={inputRef} type="file" className="hidden"
                  accept=".pdf,.xls,.xlsx,.doc,.docx,.png,.jpg,.jpeg,.csv,.txt"
                  onChange={e => pickFile(e.target.files?.[0])} />
              </div>
              <p className="text-[10px] text-gray-400">Le fichier sera envoyé sur Google Drive (visible dans l&apos;onglet Stockage) puis associé automatiquement.</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg">Annuler</button>
                <button type="button" onClick={doUpload} disabled={!file || uploading}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {uploading ? "Envoi Google Drive…" : "Envoyer"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un fichier dans le Stockage (2 car. min)…"
                  className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm" />
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                {searching ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Recherche…</div>
                ) : results.length === 0 ? (
                  <p className="py-6 text-center text-xs text-gray-400">Aucun fichier trouvé dans le Stockage.</p>
                ) : (
                  results.map(f => (
                    <button key={f.id} type="button" onClick={() => doLink(f)} disabled={!!linkingId}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50">
                      {fileIconFor(f.name, f.mimeType)}
                      <span className="truncate flex-1 text-gray-700 dark:text-gray-200">{f.name}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">{formatSize(f.size)}</span>
                      {linkingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <Link2 className="w-3.5 h-3.5 text-gray-400" />}
                    </button>
                  ))
                )}
              </div>
              <p className="text-[10px] text-gray-400">Le fichier reste en <b>un seul exemplaire</b> dans Google Drive ; une simple association est créée.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
