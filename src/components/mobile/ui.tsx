"use client";

import type { CSSProperties, ReactNode } from "react";

/** Date courte en français (jj/mm/aaaa) ; vide si absente */
export function fmtDay(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Tuile de tableau de bord */
export function StatTile({ label, value, tone = "text-gray-900" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone} dark:text-white`}>{value}</div>
    </div>
  );
}

/** Section de fiche commande */
export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Ligne libellé / valeur */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="text-right text-slate-900 dark:text-slate-100 break-words min-w-0">{value || "—"}</span>
    </div>
  );
}

/** Bouton tactile (zone de touche ≥ 44 px) */
export const btnPrimary = "min-h-[48px] w-full rounded-xl bg-blue-600 px-4 text-base font-semibold text-white active:bg-blue-700 disabled:opacity-50";
export const btnGhost = "min-h-[44px] rounded-xl px-4 text-sm font-medium text-blue-700 dark:text-blue-300 active:bg-slate-100 dark:active:bg-slate-700";
/** Champ : 16 px minimum pour éviter le zoom automatique d'iOS */
export const fieldClass = "w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base text-slate-900 dark:text-slate-100";

/** Message d'erreur / d'information */
export function Notice({ tone, children }: { tone: "error" | "info" | "success" | "warn"; children: ReactNode }) {
  const styles = {
    error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200",
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-200",
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-200",
    warn: "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200",
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

/** Pastille d'état colorée selon le gestionnaire de couleurs (app_colors) */
export function StatePill({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border" style={style}>{children}</span>;
}
