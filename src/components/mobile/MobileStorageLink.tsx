"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { btnGhost, fieldClass, Notice } from "./ui";

type StorageFile = { id: string; name: string; isFolder: boolean };
/** Recherche volontaire dans le stockage central, sans copier les fichiers. */
export default function MobileStorageLink({ onLink, busy, onSessionExpired }: { onLink: (id: string) => Promise<void>; busy: boolean; onSessionExpired: () => void }) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const search = async (pageToken?: string) => {
    setSearching(true); setError("");
    const term = pageToken ? searchedQuery : query.trim();
    try {
      const params = new URLSearchParams({ q: term, pageSize: "25" });
      if (pageToken) params.set("pageToken", pageToken);
      const data = await apiFetch<{ files: StorageFile[]; nextPageToken: string | null }>(`/api/storage/files?${params}`);
      setFiles((rows) => pageToken ? [...rows, ...data.files.filter((f) => !f.isFolder && !rows.some((r) => r.id === f.id))] : data.files.filter((f) => !f.isFolder));
      setNextPage(data.nextPageToken); setSearched(true); setSearchedQuery(term);
    } catch (err) { const message = err instanceof Error ? err.message : "Recherche impossible"; if (message === "Non authentifié") onSessionExpired(); else setError(message); }
    finally { setSearching(false); }
  };
  return <div className="space-y-2 border-t pt-3">
    <h3 className="text-sm font-semibold">Associer un fichier du stockage</h3>
    <label className="block text-sm">Nom du fichier (2 caractères minimum)<input type="search" className={fieldClass} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <button type="button" className={btnGhost} disabled={busy || searching || query.trim().length < 2} onClick={() => search()}>Rechercher dans le stockage</button>
    {searching && <p role="status">Recherche…</p>}
    {error && <Notice tone="error">{error}</Notice>}
    {searched && <p className="text-xs">Résultats pour « {searchedQuery} »</p>}
    {searched && !searching && files.length === 0 && <p className="text-sm">Aucun fichier trouvé.</p>}
    <ul className="space-y-1">{files.map((file) => <li key={file.id}><button type="button" disabled={busy || searching} className={`${btnGhost} w-full text-left break-all`} onClick={() => { if (window.confirm(`Associer « ${file.name} » à cette commande ?`)) void onLink(file.id); }}>{file.name} — Associer</button></li>)}</ul>
    {nextPage && <button type="button" className={btnGhost} disabled={busy || searching} onClick={() => search(nextPage)}>Afficher plus de fichiers</button>}
  </div>;
}
