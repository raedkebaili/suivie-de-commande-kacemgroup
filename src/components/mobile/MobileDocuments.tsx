"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import MobileStorageLink from "./MobileStorageLink";
import { apiFetch } from "@/lib/api";
import { DOCUMENT_CATEGORIES, DOCUMENT_ALLOWED_EXTENSIONS, DOCUMENT_MAX_SIZE, documentCategoryLabel, documentExtensionAllowed, type LinkedDocument } from "@/lib/document-categories";
import type { User } from "@/lib/types";
import { Section, Notice, btnGhost, btnPrimary, fieldClass, fmtDay } from "./ui";

export default function MobileDocuments({ orderId, user, onSessionExpired }: { orderId: number; user: User; onSessionExpired: () => void }) {
  const [docs, setDocs] = useState<LinkedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("AUTRE");
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const canAdd = ["superadmin", "commercial", "technique"].includes(user.role);
  const report = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : "Opération impossible";
    if (message === "Non authentifié") onSessionExpired(); else setError(message);
  }, [onSessionExpired]);
  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await apiFetch<{ documents: LinkedDocument[] }>(`/api/documents?entity=order&id=${orderId}`); setDocs(data.documents); }
    catch (err) { report(err); } finally { setLoading(false); }
  }, [orderId, report]);
  useEffect(() => { void load(); }, [load]);
  const upload = async () => {
    if (!file) return;
    if (!documentExtensionAllowed(file.name) || file.size <= 0 || file.size > DOCUMENT_MAX_SIZE) { setError("Format non autorisé ou taille invalide (50 Mo maximum)."); return; }
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.append("entity", "order"); body.append("entityId", String(orderId)); body.append("category", category); body.append("file", file);
      await apiFetch("/api/documents", { method: "POST", body });
      setFile(null); if (input.current) input.current.value = ""; await load();
    } catch (err) { report(err); } finally { setBusy(false); }
  };
  const link = async (driveFileId: string) => {
    setBusy(true); setError("");
    try {
      await apiFetch("/api/documents", { method: "POST", body: JSON.stringify({ mode: "link", entity: "order", entityId: orderId, category, driveFileId }) });
      await load();
    } catch (err) { report(err); } finally { setBusy(false); }
  };
  const unlink = async (doc: LinkedDocument) => {
    if (!window.confirm(`Retirer l’association de « ${doc.fileName} » ? Le fichier restera dans le stockage.`)) return;
    setBusy(true); setError("");
    try { await apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" }); await load(); }
    catch (err) { report(err); } finally { setBusy(false); }
  };
  return <Section title="Documents de la commande">
    <div className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      <button className={btnGhost} disabled={busy || loading} onClick={() => { setError(""); void load(); }}>Actualiser les documents</button>
      {loading && <p role="status">Chargement…</p>}
      {!loading && docs.length === 0 && <p className="text-sm">Aucun document associé.</p>}
      {docs.map((doc) => <div key={doc.id} className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-1">
        <p className="text-sm font-medium break-all">{doc.fileName}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{documentCategoryLabel(doc.category)} · {fmtDay(doc.createdAt)} · {doc.uploadedByName}</p>
        <div className="flex flex-wrap gap-2">
          <a className={`${btnGhost} inline-flex items-center`} href={`/api/storage/download/${encodeURIComponent(doc.driveFileId)}?mode=attachment`}>Télécharger</a>
          <a className={`${btnGhost} inline-flex items-center`} target="_blank" rel="noreferrer" href={`/api/storage/download/${encodeURIComponent(doc.driveFileId)}?mode=inline`}>Ouvrir</a>
          {!["gerant", "acces_agence"].includes(user.role) && (user.role === "superadmin" || user.id === doc.uploadedById) && <button className={btnGhost} disabled={busy} onClick={() => unlink(doc)}>Dissocier</button>}
        </div>
      </div>)}
      {canAdd && <fieldset disabled={busy} className="space-y-3 border-t pt-3">
        <legend className="text-sm font-semibold">Ajouter un document</legend>
        <label className="block text-sm">Catégorie<select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value)}>{DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{documentCategoryLabel(c)}</option>)}</select></label>
        <label className="block text-sm">Fichier (50 Mo maximum)<input ref={input} type="file" accept={DOCUMENT_ALLOWED_EXTENSIONS.join(",")} className={`${fieldClass} py-3`} onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
        <button type="button" className={btnPrimary} disabled={!file || busy} onClick={upload}>{busy ? "Envoi en cours…" : "Envoyer le document"}</button>
        <MobileStorageLink onLink={link} busy={busy} onSessionExpired={onSessionExpired} />
      </fieldset>}
    </div>
  </Section>;
}
