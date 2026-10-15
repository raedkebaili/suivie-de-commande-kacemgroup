"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { Notice, btnGhost, fmtDay } from "./ui";

const PAGE_SIZE = 30;

export default function MobileNotifications({ onOpenOrder, onSessionExpired }: { onOpenOrder: (id: number) => void; onSessionExpired: () => void }) {
  const [rows, setRows] = useState<Notification[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    apiFetch<{ notifications: Notification[]; unreadCount: number; hasMore: boolean }>(`/api/notifications?limit=${limit}`)
      .then((data) => { if (active) { setRows(data.notifications); setHasMore(data.hasMore); setUnreadCount(data.unreadCount); } })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Chargement impossible";
        if (message === "Non authentifié") onSessionExpired(); else setError(message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [limit, revision, onSessionExpired]);

  const toggleRead = async (row: Notification) => {
    setBusy(row.id); setError("");
    try {
      await apiFetch(`/api/notifications/${row.id}`, { method: "PUT", body: JSON.stringify({ read: !row.read }) });
      setRevision((r) => r + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Modification impossible";
      if (message === "Non authentifié") onSessionExpired(); else setError(message);
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Notifications</h1>
        <button className={btnGhost} disabled={loading || busy !== null} onClick={() => setRevision((r) => r + 1)}>Actualiser</button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">{unreadCount} non lue(s)</p>
      {error && <Notice tone="error">{error}</Notice>}
      {loading && <p role="status">Chargement…</p>}
      {!loading && !error && rows.length === 0 && <Notice tone="info">Aucune notification.</Notice>}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 space-y-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">{fmtDay(row.createdAt)} · {row.read ? "Lue" : "Non lue"}</div>
            <h2 className={`text-sm ${row.read ? "font-medium" : "font-bold"}`}>{row.title}</h2>
            <p className="text-sm whitespace-pre-wrap break-words">{row.message}</p>
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} disabled={busy !== null || loading} onClick={() => toggleRead(row)}>{busy === row.id ? "Enregistrement…" : row.read ? "Marquer non lue" : "Marquer comme lue"}</button>
              {row.orderId !== null && row.orderId !== undefined && <button className={btnGhost} onClick={() => onOpenOrder(row.orderId!)}>Voir la commande</button>}
            </div>
          </li>
        ))}
      </ul>
      {hasMore && limit < 500 && <button className={`${btnGhost} w-full`} disabled={loading} onClick={() => setLimit((n) => Math.min(n + PAGE_SIZE, 500))}>Afficher plus</button>}
      {hasMore && limit >= 500 && <Notice tone="info">Les 500 notifications les plus récentes sont affichées.</Notice>}
    </div>
  );
}
