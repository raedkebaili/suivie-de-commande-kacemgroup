"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Agency, Client } from "@/lib/types";
import { filterMobileDirectory } from "@/lib/mobile-navigation";
import { Notice, Row, Section, btnGhost, fieldClass } from "./ui";

/** Annuaire en lecture seule : les créations/modifications restent sur ordinateur. */
export default function MobileDirectory({ kind, onSessionExpired }: { kind: "clients" | "agencies"; onSessionExpired: () => void }) {
  const [rows, setRows] = useState<(Client & Agency)[]>([]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const title = kind === "clients" ? "Clients" : "Agences";

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    apiFetch<{ clients?: Client[]; agencies?: Agency[] }>(`/api/${kind}`)
      .then((data) => { if (active) setRows(data[kind] || []); })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Chargement impossible";
        if (message === "Non authentifié") onSessionExpired();
        else setError(message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, revision, onSessionExpired]);

  const filtered = filterMobileDirectory(rows, query);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{title}</h1>
        <button className={btnGhost} disabled={loading} onClick={() => setRevision((r) => r + 1)}>Actualiser</button>
      </div>
      <input className={fieldClass} type="search" aria-label={`Rechercher dans ${title}`} placeholder="Nom, code, coordonnées…" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(30); }} />
      {error && <Notice tone="error">{error}</Notice>}
      {loading ? <p role="status">Chargement…</p> : <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} résultat(s) — consultation uniquement</p>}
      {!loading && !error && filtered.length === 0 && <Notice tone="info">Aucun résultat.</Notice>}
      {filtered.slice(0, limit).map((row) => (
        <Section key={row.id} title={row.name}>
          <Row label="Code" value={row.code} />
          <Row label="Statut" value={row.active === false ? "Inactif" : "Actif"} />
          {kind === "clients" && <>
            <Row label="Contact" value={row.contactName} />
            <Row label="Téléphone" value={row.phone ? <a className="text-blue-700 dark:text-blue-300 inline-flex min-h-[44px] items-center" href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}>{row.phone}</a> : null} />
            <Row label="E-mail" value={row.email ? <a className="text-blue-700 dark:text-blue-300 inline-flex min-h-[44px] items-center break-all" href={`mailto:${encodeURIComponent(row.email)}`}>{row.email}</a> : null} />
          </>}
          <Row label="Adresse" value={row.address} />
        </Section>
      ))}
      {filtered.length > limit && <button className={`${btnGhost} w-full`} onClick={() => setLimit((n) => n + 30)}>Afficher plus</button>}
    </div>
  );
}
