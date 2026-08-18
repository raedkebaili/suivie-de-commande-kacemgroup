"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch, getToken, removeToken } from "@/lib/api";
import type { User } from "@/lib/types";

type BackupMeta = {
  app: string;
  version: number;
  createdAt: string;
  createdBy: string;
  totalRecords: number;
  tables: Record<string, number>;
};

type BackupHistoryItem = {
  id: number;
  filename: string;
  filepath: string | null;
  filesize: number | null;
  totalRecords: number;
  type: "manual" | "automatic";
  status: "success" | "error" | "pending";
  errorMessage: string | null;
  hasData: boolean;
  createdAt: string;
  createdByName: string | null;
};

type BackupSettings = {
  enabled: boolean;
  time: string;
  maxCount: number;
  lastRun: string | null;
  lastStatus: string | null;
  lastBackup: BackupHistoryItem | null;
  totalAutoBackups: number;
  totalBackups: number;
};

const TABLE_LABELS: Record<string, string> = {
  users: "Utilisateurs",
  agencies: "Agences",
  clients: "Clients",
  orders: "Commandes",
  orderItems: "Articles de commande",
  productionBatches: "Lots de production",
  expeditionBatches: "Lots d'expédition",
  productionUnitLib: "Unités de production",
  articleLibrary: "Bibliothèque d'articles",
  techLibrary: "Bibliothèque technique historique",
  materialCategories: "Catégories de matières",
  matieres: "Matières",
  itemTechnicalComponents: "Composants techniques des articles",
  activityLogs: "Journal d'activité",
  modificationLogs: "Journal de modifications",
  photometricStudies: "Études photométriques",
  photometricStudyItems: "Articles des études photométriques",
  notifications: "Notifications",
};

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} octets`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export default function BackupView({ user }: { user: User }) {
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; meta: BackupMeta | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // États pour la sauvegarde automatique
  const [autoSettings, setAutoSettings] = useState<BackupSettings | null>(null);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingBackup, setTestingBackup] = useState(false);
  
  // Formulaire des paramètres
  const [formEnabled, setFormEnabled] = useState(true);
  const [formTime, setFormTime] = useState("22:00");
  const [formMaxCount, setFormMaxCount] = useState(30);

  // Charger les paramètres et l'historique
  const loadData = useCallback(async () => {
    try {
      setLoadingSettings(true);
      const [settingsRes, historyRes] = await Promise.all([
        apiFetch<BackupSettings>("/api/backup/auto"),
        apiFetch<{ history: BackupHistoryItem[] }>("/api/backup/history?limit=20"),
      ]);
      
      setAutoSettings(settingsRes);
      setHistory(historyRes.history);
      
      // Initialiser le formulaire
      setFormEnabled(settingsRes.enabled);
      setFormTime(settingsRes.time || "22:00");
      setFormMaxCount(settingsRes.maxCount || 30);
    } catch (err) {
      console.error("Erreur chargement paramètres backup:", err);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    if (user.role === "superadmin") {
      loadData();
    }
  }, [user.role, loadData]);

  if (user.role !== "superadmin") {
    return <div className="text-center text-gray-500 py-12">Accès réservé au Super Administrateur</div>;
  }

  const downloadBackup = async () => {
    setMessage(null);
    setDownloading(true);
    try {
      const token = getToken();
      const res = await fetch("/api/backup", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
        throw new Error(err.error || "Erreur lors du téléchargement");
      }
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] || `ordertrack-backup-${new Date().toISOString().slice(0, 19)}.json`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: "success", text: `Sauvegarde téléchargée : ${filename}` });
      loadData(); // Rafraîchir l'historique
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erreur lors du téléchargement" });
    } finally {
      setDownloading(false);
    }
  };

  const onFilePicked = async (file: File | undefined) => {
    setMessage(null);
    if (!file) { setPendingFile(null); return; }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setPendingFile({ file, meta: parsed?.meta || null });
    } catch {
      setPendingFile({ file, meta: null });
      setMessage({ type: "error", text: "Le fichier sélectionné n'est pas un JSON de sauvegarde valide" });
    }
  };

  const confirmRestore = async () => {
    if (!pendingFile) return;
    if (!confirm("⚠️ Cette action va REMPLACER TOUTES les données actuelles par celles de la sauvegarde. Cette opération est irréversible. Continuer ?")) return;
    setRestoring(true);
    setMessage(null);
    try {
      const text = await pendingFile.file.text();
      const token = getToken();
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: text,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors de la restauration");
      setMessage({ type: "success", text: `Restauration réussie : ${json.restored} enregistrements rechargés. Rechargez la page pour voir les données à jour.` });
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erreur lors de la restauration" });
    } finally {
      setRestoring(false);
    }
  };

  const saveAutoSettings = async () => {
    setSavingSettings(true);
    setMessage(null);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          backup_enabled: String(formEnabled),
          backup_time: formTime,
          backup_max_count: String(formMaxCount),
        }),
      });
      setMessage({ type: "success", text: "Paramètres de sauvegarde automatique enregistrés" });
      loadData();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erreur lors de la sauvegarde des paramètres" });
    } finally {
      setSavingSettings(false);
    }
  };

  const testAutoBackup = async () => {
    setTestingBackup(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ ok: boolean; filename?: string; totalRecords?: number; error?: string }>(
        "/api/backup/auto",
        { method: "POST", body: JSON.stringify({ force: true }) }
      );
      if (result.ok) {
        setMessage({ type: "success", text: `Test de sauvegarde réussi : ${result.filename} (${result.totalRecords} enregistrements)` });
        loadData();
      } else {
        throw new Error(result.error || "Erreur inconnue");
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erreur lors du test" });
    } finally {
      setTestingBackup(false);
    }
  };

  const downloadFromHistory = async (id: number, filename: string) => {
    setMessage(null);
    try {
      const token = getToken();
      const res = await fetch(`/api/backup/download/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
        throw new Error(err.error || "Erreur lors du téléchargement");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: "success", text: `Sauvegarde téléchargée : ${filename}` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erreur lors du téléchargement" });
    }
  };

  const resetDatabase = async () => {
    if (resetConfirmation !== "REINITIALISER" || !resetPassword) return;
    const accepted = confirm(
      "DANGER : toutes les commandes, clients, agences, utilisateurs, bibliothèques et tous les journaux seront définitivement supprimés. Continuer ?",
    );
    if (!accepted) return;

    setResetting(true);
    setMessage(null);
    try {
      const token = getToken();
      const res = await fetch("/api/admin/reset-database", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          password: resetPassword,
          confirmation: resetConfirmation,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors du formatage");

      removeToken();
      alert("Base réinitialisée. Reconnectez-vous avec admin / admin123.");
      window.location.assign("/login");
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erreur lors du formatage" });
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Sauvegarde &amp; Restauration</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Sauvegardez l&apos;intégralité de la base de données dans un fichier unique, et restaurez-la en cas de perte de données.
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${message.type === "success"
          ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
          : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"}`}>
          <span>{message.type === "success" ? "✅" : "⚠️"}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Sauvegarde automatique */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-2xl p-6 shadow-sm border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white text-lg">⏰</div>
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-white">Sauvegarde Automatique Quotidienne</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Planifiez une sauvegarde automatique chaque jour
            </p>
          </div>
        </div>

        {loadingSettings ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Activer/Désactiver */}
              <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-800 dark:text-white text-sm">Activer</div>
                    <div className="text-xs text-gray-500">Sauvegarde quotidienne</div>
                  </div>
                </label>
              </div>

              {/* Heure */}
              <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Heure d&apos;exécution</span>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white"
                  />
                </label>
              </div>

              {/* Nombre max */}
              <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Conserver (max)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={formMaxCount}
                      onChange={(e) => setFormMaxCount(parseInt(e.target.value) || 30)}
                      className="w-20 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-center text-gray-800 dark:text-white"
                    />
                    <span className="text-xs text-gray-500">sauvegardes</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Boutons */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={saveAutoSettings}
                disabled={savingSettings}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {savingSettings ? (
                  <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Enregistrement...</>
                ) : (
                  <>💾 Enregistrer</>
                )}
              </button>
              <button
                onClick={testAutoBackup}
                disabled={testingBackup}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
              >
                {testingBackup ? (
                  <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Test...</>
                ) : (
                  <>🧪 Tester maintenant</>
                )}
              </button>
            </div>

            {/* Statut de la dernière sauvegarde */}
            {autoSettings && (
              <div className="mt-4 p-4 rounded-xl bg-white/70 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">📊 Statut</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Dernière exécution</div>
                    <div className="font-medium text-gray-800 dark:text-white">
                      {autoSettings.lastRun ? formatDate(autoSettings.lastRun) : "Jamais"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Statut</div>
                    <div className={`font-medium ${autoSettings.lastStatus?.startsWith("error") ? "text-red-600" : autoSettings.lastStatus === "success" ? "text-green-600" : "text-gray-600"}`}>
                      {autoSettings.lastStatus === "success" ? "✅ Succès" : autoSettings.lastStatus?.startsWith("error") ? "❌ Erreur" : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Sauvegardes auto</div>
                    <div className="font-medium text-gray-800 dark:text-white">{autoSettings.totalAutoBackups}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Total (auto + manuel)</div>
                    <div className="font-medium text-gray-800 dark:text-white">{autoSettings.totalBackups}</div>
                  </div>
                </div>
                {autoSettings.lastStatus?.startsWith("error:") && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/30 p-2 rounded">
                    {autoSettings.lastStatus.replace("error: ", "")}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Historique des sauvegardes */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
          <h4 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2 mb-4">📋 Historique des sauvegardes</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Fichier</th>
                  <th className="pb-2 font-medium">Taille</th>
                  <th className="pb-2 font-medium">Enregistrements</th>
                  <th className="pb-2 font-medium">Statut</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 text-gray-800 dark:text-white">{formatDate(item.createdAt)}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.type === "automatic" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {item.type === "automatic" ? "⏰ Auto" : "👤 Manuel"}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">{item.filename}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">{formatFileSize(item.filesize)}</td>
                    <td className="py-2 text-gray-800 dark:text-white font-medium">{item.totalRecords}</td>
                    <td className="py-2">
                      {item.status === "success" ? (
                        <span className="text-green-600">✅</span>
                      ) : item.status === "error" ? (
                        <span className="text-red-600" title={item.errorMessage || ""}>❌</span>
                      ) : (
                        <span className="text-yellow-600">⏳</span>
                      )}
                    </td>
                    <td className="py-2">
                      {item.status === "success" && item.hasData ? (
                        <button
                          onClick={() => downloadFromHistory(item.id, item.filename)}
                          className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center gap-1"
                        >
                          ⬇️ Télécharger
                        </button>
                      ) : item.status === "success" && !item.hasData ? (
                        <span className="text-xs text-gray-400" title="Ce fichier a été généré avant l'activation du stockage en base">—</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export manuel */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">💾 Sauvegarde Manuelle</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md">
              Télécharge un fichier .json contenant l&apos;ensemble des données de l&apos;application.
            </p>
          </div>
          <button onClick={downloadBackup} disabled={downloading}
            className="shrink-0 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {downloading
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Génération...</>
              : <>⬇️ Télécharger</>}
          </button>
        </div>
      </div>

      {/* Restore */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
        <h4 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">📂 Restaurer une sauvegarde</h4>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Sélectionnez un fichier de sauvegarde .json pour recharger toutes les données. <span className="font-semibold text-red-600 dark:text-red-400">Toutes les données actuelles seront remplacées.</span>
        </p>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={e => onFilePicked(e.target.files?.[0])}
            className="text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-200 file:text-sm file:font-medium hover:file:bg-gray-200 dark:hover:file:bg-gray-700" />
          <button onClick={confirmRestore} disabled={!pendingFile || restoring}
            className="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
            {restoring
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Restauration...</>
              : <>♻️ Restaurer</>}
          </button>
        </div>

        {pendingFile?.meta && (
          <div className="mt-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-sm">
            <div className="font-medium text-gray-700 dark:text-gray-200 mb-2">Aperçu du fichier sélectionné</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-500 dark:text-gray-400">
              <div>Application</div><div className="text-gray-800 dark:text-white">{pendingFile.meta.app || "-"}</div>
              <div>Créée le</div><div className="text-gray-800 dark:text-white">{new Date(pendingFile.meta.createdAt).toLocaleString("fr-FR")}</div>
              <div>Créée par</div><div className="text-gray-800 dark:text-white">{pendingFile.meta.createdBy || "-"}</div>
              <div>Total d&apos;enregistrements</div><div className="text-gray-800 dark:text-white font-semibold">{pendingFile.meta.totalRecords ?? "-"}</div>
            </div>
            {pendingFile.meta.tables && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(pendingFile.meta.tables).map(([k, v]) => (
                  <div key={k} className="flex justify-between px-2 py-1 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400">{TABLE_LABELS[k] || k}</span>
                    <span className="font-semibold text-gray-800 dark:text-white">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {pendingFile && !pendingFile.meta && (
          <div className="mt-3 text-sm text-yellow-600 dark:text-yellow-400">Le fichier a été sélectionné mais son entête n&apos;a pas pu être lue (format inattendu).</div>
        )}
      </div>

      {/* Factory reset */}
      <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl p-6 border-2 border-red-300 dark:border-red-900">
        <div className="flex items-start gap-3">
          <div className="text-2xl" aria-hidden="true">⚠️</div>
          <div className="flex-1">
            <h4 className="font-semibold text-red-800 dark:text-red-300">Zone de danger — Formater la base</h4>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">
              Supprime définitivement toutes les données et remet tous les compteurs à zéro. Seul le compte de secours <strong>admin / admin123</strong> sera recréé.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-xs font-medium text-red-800 dark:text-red-300 mb-1">Votre mot de passe actuel</span>
            <input
              type="password"
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              disabled={resetting}
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-gray-900 text-sm"
              placeholder="Mot de passe administrateur"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-red-800 dark:text-red-300 mb-1">Tapez REINITIALISER</span>
            <input
              type="text"
              value={resetConfirmation}
              onChange={e => setResetConfirmation(e.target.value.toUpperCase())}
              disabled={resetting}
              autoComplete="off"
              className="w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-gray-900 text-sm font-mono"
              placeholder="REINITIALISER"
            />
          </label>
        </div>

        <button
          onClick={resetDatabase}
          disabled={resetting || !resetPassword || resetConfirmation !== "REINITIALISER"}
          className="mt-4 px-4 py-2.5 bg-red-700 text-white rounded-lg text-sm font-semibold hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {resetting
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Formatage en cours...</>
            : <>🗑️ Réinitialiser et formater la base</>}
        </button>
      </div>

      <div className="text-xs text-gray-400 dark:text-gray-500">
        💡 Astuce : la sauvegarde automatique s&apos;exécute chaque jour à l&apos;heure configurée. Les anciennes sauvegardes sont automatiquement supprimées selon la limite définie.
      </div>
    </div>
  );
}
