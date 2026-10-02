"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getToken } from "@/lib/api";
import type { User } from "@/lib/types";
import GoogleDriveGuide from "@/components/GoogleDriveGuide";

type Cfg = {
  status: string; connected: boolean; googleAccountEmail: string | null;
  rootFolderName: string; rootFolderConfigured: boolean;
  connectedAt: string | null; lastSyncAt: string | null; connectedByName: string | null;
  lastError: string | null; credentialsConfigured: boolean; isAdmin: boolean;
  admin: { clientIdMasked: string | null; credentialsSource: string; redirectUri: string } | null;
};
type DriveFile = {
  id: string; name: string; mimeType: string; isFolder: boolean;
  size: number | null; modifiedTime: string | null;
};
type Stats = {
  account: string | null; rootFolderName: string; fileCount: number; folderCount: number;
  managedSize: number; lastFile: { name: string; modifiedTime: string } | null; lastSync: string;
  quota: { limit: number | null; usage: number | null; available: number | null; percent: number | null; unlimited: boolean };
};

const fmtSize = (b: number | null | undefined) => {
  if (b === null || b === undefined) return "—";
  if (b < 1024) return `${b} o`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} Ko`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} Mo`;
  return `${(b / 1024 ** 3).toFixed(2)} Go`;
};
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return d; }
};

/**
 * Onglet « Stockage » — gestionnaire de fichiers adossé à un Google Drive
 * CENTRAL configuré par l'administrateur. Les utilisateurs ne voient ni
 * identifiants ni jetons : tout transite par le backend de la plateforme.
 */
export default function StorageView({ user }: { user: User }) {
  const isAdmin = user.role === "superadmin";

  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);
  const [folderId, setFolderId] = useState<string>("");
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [pageStack, setPageStack] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState("modifiedTime desc");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; checks?: { step: string; ok: boolean; detail?: string }[] } | null>(null);
  const [uploadState, setUploadState] = useState<{ total: number; success: number; errors: { name: string; reason: string }[] } | null>(null);
  const [preview, setPreview] = useState<DriveFile | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(""), 5000); };
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 400); return () => clearTimeout(t); }, [search]);

  const loadConfig = useCallback(async () => {
    try { setCfg(await apiFetch<Cfg>("/api/storage/config")); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  }, []);

  const loadFiles = useCallback(async (token?: string | null) => {
    try {
      const p = new URLSearchParams({ pageSize: String(pageSize), sort });
      if (folderId) p.set("folderId", folderId);
      if (debounced.trim().length >= 2) p.set("q", debounced.trim());
      if (typeFilter) p.set("type", typeFilter);
      if (token) p.set("pageToken", token);
      const d = await apiFetch<{ files: DriveFile[]; nextPageToken: string | null; breadcrumb: { id: string; name: string }[]; rootFolderId: string; folderId: string }>(`/api/storage/files?${p}`);
      setFiles(d.files); setPageToken(d.nextPageToken); setBreadcrumb(d.breadcrumb || []);
      if (!folderId) setFolderId(d.folderId);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur de chargement"); }
  }, [folderId, debounced, pageSize, sort, typeFilter]);

  const loadStats = useCallback(async () => {
    try { setStats(await apiFetch<Stats>("/api/storage/stats")); } catch { /* non bloquant */ }
  }, []);

  useEffect(() => { loadConfig().finally(() => setLoading(false)); }, [loadConfig]);
  useEffect(() => { if (cfg?.connected) { loadFiles(); loadStats(); } }, [cfg?.connected, loadFiles, loadStats]);

  // Retour depuis la fenêtre OAuth
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.source === "ordertrack-gdrive") { loadConfig(); loadStats(); flash(e.data.ok ? "Google Drive connecté" : "Connexion Google échouée"); }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [loadConfig, loadStats]);

  // ── Actions administrateur ──
  const saveCredentials = async () => {
    if (!clientIdInput.trim() || !clientSecretInput.trim()) { setError("Client ID et Client Secret requis"); return; }
    setBusy(true); setError("");
    try {
      await apiFetch("/api/storage/config", { method: "PUT", body: JSON.stringify({ clientId: clientIdInput.trim(), clientSecret: clientSecretInput.trim() }) });
      setClientIdInput(""); setClientSecretInput(""); setShowConfig(false);
      flash("Identifiants enregistrés de façon sécurisée");
      await loadConfig();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    setBusy(true); setError("");
    try {
      const d = await apiFetch<{ url: string }>("/api/storage/oauth/start", { method: "POST", body: "{}" });
      window.open(d.url, "google-oauth", "width=560,height=680");
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  };

  const testConnection = async () => {
    setBusy(true); setTestResult(null); setError("");
    try {
      const d = await apiFetch<{ ok: boolean; message: string; checks: { step: string; ok: boolean; detail?: string }[] }>("/api/storage/test", { method: "POST", body: "{}" });
      setTestResult({ ok: true, message: d.message, checks: d.checks });
      await loadConfig(); await loadStats();
    } catch (e) { setTestResult({ ok: false, message: e instanceof Error ? e.message : "Erreur" }); await loadConfig(); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!confirm("Déconnecter Google Drive ?\n\nLes fichiers restent dans Google Drive. Seule la connexion entre la plateforme et Google Drive sera supprimée.")) return;
    setBusy(true);
    try { const d = await apiFetch<{ message: string }>("/api/storage/disconnect", { method: "POST", body: "{}" }); flash(d.message); await loadConfig(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  };

  // ── Opérations fichiers ──
  const doUpload = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    const pdfs = arr.filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const rejected = arr.filter(f => !pdfs.includes(f)).map(f => ({ name: f.name, reason: "Seuls les PDF sont acceptés" }));
    if (pdfs.length === 0) { setUploadState({ total: arr.length, success: 0, errors: rejected }); return; }

    setBusy(true); setUploadState({ total: arr.length, success: 0, errors: rejected });
    const fd = new FormData();
    for (const f of pdfs) fd.append("files", f);
    if (folderId) fd.append("folderId", folderId);
    try {
      const d = await apiFetch<{ uploaded: { name: string }[]; failed: { name: string; reason: string }[] }>("/api/storage/upload", { method: "POST", body: fd });
      setUploadState({ total: arr.length, success: d.uploaded.length, errors: [...rejected, ...d.failed] });
      if (d.uploaded.length > 0) flash(`${d.uploaded.length} fichier(s) ajouté(s)`);
      await loadFiles(); await loadStats();
    } catch (e) {
      setUploadState({ total: arr.length, success: 0, errors: [...rejected, { name: "Envoi", reason: e instanceof Error ? e.message : "Erreur" }] });
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const download = async (f: DriveFile, inline = false) => {
    try {
      const res = await fetch(`/api/storage/download/${f.id}?mode=${inline ? "inline" : "attachment"}`, { headers: { Authorization: `Bearer ${getToken() || ""}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Téléchargement impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (inline) { window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000); }
      else { const a = document.createElement("a"); a.href = url; a.download = f.name; a.click(); URL.revokeObjectURL(url); }
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const removeFile = async (f: DriveFile) => {
    if (!confirm(`Voulez-vous vraiment supprimer « ${f.name} » ?`)) return;
    try { await apiFetch(`/api/storage/files/${f.id}`, { method: "DELETE" }); flash("Supprimé"); await loadFiles(); await loadStats(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const rename = async (f: DriveFile) => {
    const name = prompt("Nouveau nom :", f.name);
    if (!name || name === f.name) return;
    try { await apiFetch(`/api/storage/files/${f.id}`, { method: "PUT", body: JSON.stringify({ name }) }); flash("Renommé"); await loadFiles(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const move = async (f: DriveFile) => {
    try {
      const d = await apiFetch<{ root: { id: string; name: string }; folders: { id: string; name: string }[] }>("/api/storage/folders");
      const opts = [d.root, ...d.folders.filter(x => x.id !== d.root.id && x.id !== f.id)];
      const choice = prompt(`Déplacer « ${f.name} » vers :\n\n${opts.map((o, i) => `${i + 1}. ${o.name}`).join("\n")}\n\nNuméro :`);
      const idx = parseInt(choice || "") - 1;
      if (!Number.isFinite(idx) || idx < 0 || idx >= opts.length) return;
      await apiFetch(`/api/storage/files/${f.id}`, { method: "PUT", body: JSON.stringify({ parentId: opts[idx].id }) });
      flash(`Déplacé vers ${opts[idx].name}`); await loadFiles();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const createFolder = async () => {
    const name = prompt("Nom du nouveau dossier :");
    if (!name?.trim()) return;
    try { await apiFetch("/api/storage/folders", { method: "POST", body: JSON.stringify({ name: name.trim(), parentId: folderId }) }); flash("Dossier créé"); await loadFiles(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Supprimer ${selected.size} élément(s) ? Cette action est définitive.`)) return;
    setBusy(true);
    try {
      const d = await apiFetch<{ deleted: number }>("/api/storage/batch-delete", { method: "POST", body: JSON.stringify({ ids: [...selected] }) });
      flash(`${d.deleted} élément(s) supprimé(s)`); setSelected(new Set()); await loadFiles(); await loadStats();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  };

  const deleteAll = async () => {
    const count = stats?.fileCount ?? 0;
    if (!confirm(`Vous êtes sur le point de supprimer ${count} fichier(s) du stockage.\n\nCette action est irréversible.`)) return;
    const typed = prompt('Tapez SUPPRIMER pour confirmer la suppression de TOUS les fichiers :');
    if (typed !== "SUPPRIMER") { if (typed !== null) setError("Confirmation incorrecte : suppression annulée."); return; }
    setBusy(true);
    try {
      const d = await apiFetch<{ deleted: number }>("/api/storage/batch-delete", { method: "POST", body: JSON.stringify({ all: true, confirmation: "SUPPRIMER" }) });
      flash(`${d.deleted} fichier(s) supprimé(s)`); setSelected(new Set()); await loadFiles(); await loadStats();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  };

  const enterFolder = (f: DriveFile) => { setFolderId(f.id); setSearch(""); setPageStack([]); setSelected(new Set()); };

  if (loading) return <div className="flex justify-center py-16"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

  const connected = !!cfg?.connected;
  const redirectUri = cfg?.admin?.redirectUri || "";

  return (
    <div className="space-y-4">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">🗄️ Stockage</h3>
          <div className="flex items-center gap-3 flex-wrap mt-1 text-xs">
            <span className={`font-bold ${connected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {connected ? "🟢 Connecté" : cfg?.status === "expired" ? "🔴 Connexion expirée" : "🔴 Non connecté"}
            </span>
            {cfg?.googleAccountEmail && <span className="text-gray-500 dark:text-gray-400">Compte : <b>{cfg.googleAccountEmail}</b></span>}
            <span className="text-gray-500 dark:text-gray-400">Dossier : <b>{cfg?.rootFolderName}</b></span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowGuide(true)} className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50">📘 Manuel de configuration</button>
          {isAdmin && <button onClick={() => setShowConfig(v => !v)} className="px-3 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-800">⚙️ Configuration</button>}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {notice && <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">{notice}</div>}

      {/* ── Assistant / configuration (admin) ── */}
      {isAdmin && (showConfig || !connected) && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h4 className="font-bold text-gray-800 dark:text-white">Configuration du stockage Google Drive</h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
            {[
              { n: 1, t: "Projet Google Cloud", done: cfg?.credentialsConfigured, action: <button onClick={() => setShowGuide(true)} className="text-blue-600 underline">Voir le guide</button> },
              { n: 2, t: "Activer Google Drive API", done: cfg?.credentialsConfigured, action: <a className="text-blue-600 underline" href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer">Ouvrir Google Cloud</a> },
              { n: 3, t: "Créer le client OAuth", done: cfg?.credentialsConfigured, action: <button onClick={() => setShowGuide(true)} className="text-blue-600 underline">Voir le guide</button> },
              { n: 4, t: "Client ID / Client Secret", done: cfg?.credentialsConfigured, action: <button onClick={() => setShowConfig(true)} className="text-blue-600 underline">Configurer</button> },
              { n: 5, t: "Connecter Google", done: connected, action: <button onClick={connect} disabled={!cfg?.credentialsConfigured || busy} className="text-blue-600 underline disabled:text-gray-400">Connecter</button> },
              { n: 6, t: "Tester", done: connected && testResult?.ok, action: <button onClick={testConnection} disabled={!connected || busy} className="text-blue-600 underline disabled:text-gray-400">Tester</button> },
            ].map(s => (
              <div key={s.n} className={`rounded-xl border p-3 ${s.done ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800" : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"}`}>
                <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400">ÉTAPE {s.n} {s.done ? "✓" : ""}</div>
                <div className="font-semibold text-gray-800 dark:text-gray-100 text-[13px] mt-0.5">{s.t}</div>
                <div className="mt-1 text-xs">{s.action}</div>
              </div>
            ))}
          </div>

          {/* URL de redirection générée automatiquement */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">URL de redirection à copier dans Google Cloud</div>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2">
              <code className="flex-1 text-[12px] break-all text-gray-800 dark:text-gray-100">{redirectUri}</code>
              <button onClick={() => navigator.clipboard?.writeText(redirectUri).then(() => flash("URL copiée"))} className="px-2 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700">Copier</button>
            </div>
          </div>

          {/* Saisie des identifiants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Google Client ID</label>
              <input type="text" value={clientIdInput} onChange={e => setClientIdInput(e.target.value)} placeholder={cfg?.admin?.clientIdMasked || "…apps.googleusercontent.com"}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Google Client Secret</label>
              <input type="password" value={clientSecretInput} onChange={e => setClientSecretInput(e.target.value)} placeholder={cfg?.credentialsConfigured ? "•••••••• (déjà enregistré)" : "GOCSPX-…"}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200" />
            </div>
          </div>
          <p className="text-[11px] text-gray-500">🔒 Chiffrés et conservés sur le serveur. Jamais renvoyés au navigateur ni journalisés.</p>

          <div className="flex gap-2 flex-wrap">
            <button onClick={saveCredentials} disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">Enregistrer</button>
            <button onClick={connect} disabled={busy || !cfg?.credentialsConfigured} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              {connected ? "Modifier la connexion" : "Connecter Google Drive"}
            </button>
            <button onClick={testConnection} disabled={busy || !connected} className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50">Tester la connexion</button>
            {connected && <button onClick={disconnect} disabled={busy} className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm hover:bg-red-100">Déconnecter</button>}
          </div>

          {testResult && (
            <div className={`rounded-xl border p-3 text-[13px] ${testResult.ok ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300" : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300"}`}>
              <b>{testResult.ok ? "🟢 Connexion fonctionnelle" : "🔴 Échec"}</b> — {testResult.message}
              {testResult.checks && testResult.checks.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[12px]">
                  {testResult.checks.map((c, i) => <li key={i}>{c.ok ? "✓" : "✗"} {c.step}{c.detail ? ` — ${c.detail}` : ""}</li>)}
                </ul>
              )}
            </div>
          )}
          {cfg?.lastError && !cfg.lastError.startsWith("oauth_state:") && (
            <p className="text-[12px] text-amber-700 dark:text-amber-400">Dernier incident : {cfg.lastError}</p>
          )}
        </div>
      )}

      {/* ── Message pour l'utilisateur non-admin si non configuré ── */}
      {!connected && !isAdmin && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 py-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Le stockage n&apos;est pas encore disponible.</p>
          <p className="text-xs text-gray-400 mt-1">Un administrateur doit configurer la connexion au stockage.</p>
        </div>
      )}

      {/* ── Gestionnaire de fichiers ── */}
      {connected && (
        <>
          {/* Tableau de bord */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Fichiers", value: stats ? String(stats.fileCount) : "…", sub: stats ? `${stats.folderCount} dossier(s)` : "" },
              { label: "Volume géré", value: stats ? fmtSize(stats.managedSize) : "…", sub: "fichiers de la plateforme" },
              { label: "Dernier fichier", value: stats?.lastFile?.name || "—", sub: stats?.lastFile ? fmtDate(stats.lastFile.modifiedTime) : "" },
              { label: "Dernière synchro.", value: stats ? fmtDate(stats.lastSync) : "…", sub: stats?.account || "" },
            ].map((c, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">{c.label}</div>
                <div className="text-lg font-bold text-gray-800 dark:text-white truncate" title={c.value}>{c.value}</div>
                <div className="text-[11px] text-gray-400 truncate">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Espace disponible — valeurs réelles Google */}
          {stats && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
              {stats.quota.unlimited ? (
                <p className="text-[13px] text-gray-600 dark:text-gray-300">
                  <b>Espace :</b> {fmtSize(stats.quota.usage)} utilisés. Google ne communique pas de limite pour ce compte
                  (stockage sans quota défini) — le pourcentage d&apos;occupation n&apos;est donc pas disponible.
                </p>
              ) : (
                <>
                  <div className="flex justify-between text-[12px] text-gray-600 dark:text-gray-300 mb-1.5">
                    <span>Utilisé <b>{fmtSize(stats.quota.usage)}</b></span>
                    <span>Disponible <b>{fmtSize(stats.quota.available)}</b></span>
                    <span>Total <b>{fmtSize(stats.quota.limit)}</b> · {stats.quota.percent?.toFixed(1)} %</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, stats.quota.percent || 0)}%` }} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Barre d'outils */}
          <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800 flex items-center gap-2 flex-wrap">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un fichier…"
              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-60 text-gray-700 dark:text-gray-200" />
            <select value={sort} onChange={e => setSort(e.target.value)} className="px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
              <option value="name">Nom A-Z</option><option value="name desc">Nom Z-A</option>
              <option value="modifiedTime desc">Plus récent</option><option value="modifiedTime">Plus ancien</option>
              <option value="quotaBytesUsed desc">Plus grand</option><option value="quotaBytesUsed">Plus petit</option>
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
              <option value="">Tous les types</option><option value="pdf">PDF</option><option value="folder">Dossiers</option>
            </select>
            <select value={pageSize} onChange={e => setPageSize(parseInt(e.target.value))} className="px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
              <option value={25}>25/page</option><option value={50}>50/page</option><option value={100}>100/page</option>
            </select>
            <button onClick={() => { loadFiles(); loadStats(); }} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200">🔄 Actualiser</button>
            <div className="flex-1" />
            <button onClick={createFolder} className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">📁 Nouveau dossier</button>
            <input type="file" accept="application/pdf,.pdf" multiple ref={fileRef} className="hidden" onChange={e => e.target.files && doUpload(e.target.files)} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">+ Ajouter des fichiers</button>
          </div>

          {/* Fil d'Ariane + sélection */}
          <div className="flex items-center gap-2 flex-wrap text-[13px]">
            {breadcrumb.map((b, i) => (
              <React.Fragment key={b.id}>
                {i > 0 && <span className="text-gray-400">/</span>}
                <button onClick={() => { setFolderId(b.id); setSelected(new Set()); }} className={`hover:underline ${i === breadcrumb.length - 1 ? "font-bold text-gray-800 dark:text-white" : "text-blue-600 dark:text-blue-400"}`}>
                  {i === 0 ? "🗄️ " : "📁 "}{b.name}
                </button>
              </React.Fragment>
            ))}
            <div className="flex-1" />
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{selected.size} fichier(s) sélectionné(s)</span>
                <button onClick={() => files.filter(f => selected.has(f.id) && !f.isFolder).forEach(f => download(f))} className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg">Télécharger</button>
                <button onClick={deleteSelected} className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">Supprimer</button>
              </div>
            )}
            {isAdmin && selected.size === 0 && (stats?.fileCount ?? 0) > 0 && (
              <button onClick={deleteAll} className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">🗑️ Supprimer tous les fichiers</button>
            )}
          </div>

          {/* Progression d'envoi */}
          {uploadState && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-[13px]">
              <div className="flex items-center gap-3 flex-wrap">
                <b className="text-gray-800 dark:text-gray-100">{uploadState.total} fichier(s)</b>
                <span className="text-green-600 dark:text-green-400">{uploadState.success} terminé(s)</span>
                {busy && <span className="text-blue-600 dark:text-blue-400">{uploadState.total - uploadState.success - uploadState.errors.length} en cours</span>}
                {uploadState.errors.length > 0 && <span className="text-red-600 dark:text-red-400">{uploadState.errors.length} erreur(s)</span>}
                <div className="flex-1" />
                {uploadState.errors.length > 0 && <button onClick={() => fileRef.current?.click()} className="px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded">Réessayer les échecs</button>}
                <button onClick={() => setUploadState(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              {uploadState.errors.map((e, i) => <div key={i} className="text-[11px] text-red-600 dark:text-red-400 mt-1">✗ {e.name} — {e.reason}</div>)}
            </div>
          )}

          {/* Zone de dépôt + table */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) doUpload(e.dataTransfer.files); }}
            className={`bg-white dark:bg-gray-900 rounded-2xl shadow-sm border-2 overflow-hidden transition-colors ${dragOver ? "border-blue-500 border-dashed bg-blue-50/50 dark:bg-blue-900/10" : "border-gray-200 dark:border-gray-700"}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="px-3 py-2 w-8">
                      <input type="checkbox" className="accent-blue-600"
                        checked={files.length > 0 && files.every(f => selected.has(f.id))}
                        onChange={e => setSelected(e.target.checked ? new Set(files.map(f => f.id)) : new Set())} />
                    </th>
                    <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Nom</th>
                    <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Type</th>
                    <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Taille</th>
                    <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Date</th>
                    <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {files.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                      {debounced.length >= 2 ? "Aucun résultat" : "Dossier vide — glissez-déposez vos PDF ici"}
                    </td></tr>
                  ) : files.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2">
                        <input type="checkbox" className="accent-blue-600" checked={selected.has(f.id)}
                          onChange={e => { const n = new Set(selected); if (e.target.checked) n.add(f.id); else n.delete(f.id); setSelected(n); }} />
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">
                        {f.isFolder
                          ? <button onClick={() => enterFolder(f)} className="hover:underline text-blue-700 dark:text-blue-400">📁 {f.name}</button>
                          : <span>📄 {f.name}</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{f.isFolder ? "Dossier" : f.mimeType === "application/pdf" ? "PDF" : f.mimeType}</td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 text-xs">{f.isFolder ? "—" : fmtSize(f.size)}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDate(f.modifiedTime)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {!f.isFolder && <>
                          <button onClick={() => setPreview(f)} title="Visualiser" className="px-2 py-1 text-xs bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded">👁</button>
                          <button onClick={() => download(f)} title="Télécharger" className="ml-1 px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">⬇</button>
                        </>}
                        <button onClick={() => rename(f)} title="Renommer" className="ml-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">✏️</button>
                        <button onClick={() => move(f)} title="Déplacer" className="ml-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">↗</button>
                        <button onClick={() => removeFile(f)} title="Supprimer" className="ml-1 px-2 py-1 text-xs bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
            <span>{files.length} élément(s) affiché(s)</span>
            <div className="flex gap-1">
              <button disabled={pageStack.length === 0} onClick={() => { const s = [...pageStack]; s.pop(); setPageStack(s); loadFiles(s[s.length - 1] || null); }}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">← Précédent</button>
              <button disabled={!pageToken} onClick={() => { if (pageToken) { setPageStack([...pageStack, pageToken]); loadFiles(pageToken); } }}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">Suivant →</button>
            </div>
          </div>
        </>
      )}

      {/* Visualiseur PDF intégré */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setPreview(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 h-[88vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <b className="text-sm text-gray-800 dark:text-white truncate">📄 {preview.name}</b>
              <div className="flex gap-2">
                <button onClick={() => download(preview)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg">Télécharger</button>
                <button onClick={() => setPreview(null)} className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-200">Fermer</button>
              </div>
            </div>
            <iframe title={preview.name} className="flex-1 w-full rounded-b-2xl"
              src={`/api/storage/download/${preview.id}?mode=inline&token=${encodeURIComponent(getToken() || "")}`} />
          </div>
        </div>
      )}

      {showGuide && <GoogleDriveGuide redirectUri={redirectUri} onClose={() => setShowGuide(false)} />}
    </div>
  );
}
