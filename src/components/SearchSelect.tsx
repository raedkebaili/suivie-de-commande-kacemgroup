"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { norm } from "@/lib/study-search";

// ── Liste contrôlée + recherche intelligente (§6-§9) ─────────────────────
// Inspiré de CategoryMaterialSelect : suggestions instantanées,
// insensible casse/accents, début prioritaire puis contenu partiel, clavier.
// DIFFÉRENCE VOULUE : sélection OBLIGATOIRE dans la liste (jamais de texte
// libre) — principe « Liste contrôlée + recherche intelligente ».

export type SearchOption = {
  id: number;
  label: string;
  sub?: string | null;
  hint?: string | null;
};

type Props = {
  options: SearchOption[];
  value: number | null;
  onChange: (id: number | null, option: SearchOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  emptyText?: string;
  onQueryChange?: (q: string) => void;
};

export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Rechercher…",
  disabled = false,
  loading = false,
  emptyText = "Aucun résultat",
  onQueryChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value) || null;

  const filtered = useMemo(() => {
    const nq = norm(query);
    if (!nq) return options.slice(0, 30);
    const scored = options
      .map((o) => {
        const hay = `${o.label} ${o.sub || ""} ${o.hint || ""}`;
        const h = norm(hay);
        const words = nq.split(" ").filter(Boolean);
        let score = 0;
        if (norm(o.label).startsWith(nq)) score = 3;
        else if (h.startsWith(nq)) score = 2;
        else if (h.includes(nq)) score = 1;
        else if (words.length > 1 && words.every((w) => h.includes(w))) score = 1;
        return { o, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((r) => r.o).slice(0, 30);
  }, [options, query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [filtered.length]);

  function pick(o: SearchOption) {
    onChange(o.id, o);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange(null, null);
    setQuery("");
  }

  function highlightMatch(text: string) {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded bg-yellow-200 px-0.5 text-black">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  // Sélection affichée (claire, avec effacement explicite).
  if (selected && !open) {
    return (
      <div className="flex items-center gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 px-2 py-1.5 dark:border-emerald-700 dark:bg-emerald-900/30">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-emerald-900 dark:text-emerald-200">{selected.label}</div>
          {selected.sub && <div className="truncate text-[11px] text-emerald-700 dark:text-emerald-300">{selected.sub}</div>}
        </div>
        {!disabled && (
          <button onClick={clear} title="Effacer la sélection" className="rounded bg-white px-1.5 py-0.5 text-xs font-bold text-slate-500 hover:text-red-600 dark:bg-gray-700 dark:text-gray-300">
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onQueryChange?.(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (filtered.length ? (h + 1) % filtered.length : 0));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (filtered.length ? (h - 1 + filtered.length) % filtered.length : 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[highlight]) pick(filtered[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={selected ? selected.label : placeholder}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 pr-7 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">
        {loading ? "…" : "🔍"}
      </span>
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-30 mt-0.5 max-h-56 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400">{loading ? "Recherche…" : emptyText}</div>
          )}
          {filtered.map((o, i) => (
            <button
              key={o.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`block w-full px-3 py-1.5 text-left text-sm ${i === highlight ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
            >
              <span className="font-semibold text-gray-800 dark:text-gray-200">{highlightMatch(o.label)}</span>
              {o.sub && <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{o.sub}</span>}
              {o.hint && <span className="block truncate text-[11px] text-gray-400">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
