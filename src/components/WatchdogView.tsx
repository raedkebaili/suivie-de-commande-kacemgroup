"use client";
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";

type Log = { id: number; userId: number | null; username: string; action: string; details: string | null; createdAt: string };

function fmtDate(d: string): string {
  if (!d || d.startsWith("(datetime")) return new Date().toLocaleString("fr-FR");
  try {
    // Try parsing as ISO
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return dt.toLocaleString("fr-FR");
  } catch {}
  // SQLite format: "YYYY-MM-DD HH:MM:SS"
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(d);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  return d.substring(0, 16);
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "🔑 Connexion", LOGOUT: "🔒 Déconnexion",
  CREATE_ORDER: "📝 Commande créée", UPDATE_ORDER: "✏️ Commande modifiée", DELETE_ORDER: "🗑️ Commande supprimée",
  CREATE_AGENCY: "🏢 Agence créée", UPDATE_AGENCY: "✏️ Agence modifiée", DELETE_AGENCY: "🗑️ Agence supprimée",
  CREATE_CLIENT: "👤 Client créé", UPDATE_CLIENT: "✏️ Client modifié", DELETE_CLIENT: "🗑️ Client supprimé",
  CREATE_USER: "👥 Utilisateur créé", UPDATE_USER: "✏️ Utilisateur modifié", DELETE_USER: "🗑️ Utilisateur supprimé",
  PRODUCTION: "🏭 Production", EXPEDITION: "🚚 Expédition",
  IMPORT: "📥 Import", IMPORT_MATIERES: "🧪 Import Matières",
};

export default function WatchdogView({ user: _ }: { user: User }) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);

  const fetch = useCallback(async () => {
    const d = await apiFetch<{ logs: Log[] }>("/api/activity?limit=300");
    setLogs(d.logs || []);
  }, []);

  useEffect(() => { fetch().finally(() => setLoading(false)); }, [fetch]);
  useEffect(() => { if (!auto) return; const iv = setInterval(fetch, 15000); return () => clearInterval(iv); }, [auto, fetch]);

  return <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">📋 Journal d'Activité</h3>
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />Live
        </span>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} className="rounded" />Auto 15s
        </label>
        <button onClick={fetch} className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">🔄 Actualiser</button>
      </div>
    </div>
    {loading ? <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg></div> :
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-y-auto overflow-x-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 w-36">Date/Heure</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Utilisateur</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Action</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Détails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {logs.length === 0 ? <tr><td colSpan={4} className="text-center py-12 text-gray-400">Aucune activité</td></tr> :
              logs.map(l => (
                <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-3 py-2 text-gray-500 font-mono text-[11px] whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                  <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">{l.username}</td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {ACTION_LABELS[l.action] || l.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-[11px]">{l.details || "-"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>}
  </div>;
}
