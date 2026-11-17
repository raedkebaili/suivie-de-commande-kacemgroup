"use client";
import { useState } from "react";
import { calendarRange, validISODate } from "@/lib/order-date-filter-client";

export default function OrderDateFilter({ onChange }: { onChange: (range: { from: string; to: string }) => void }) {
  const [mode, setMode] = useState("all"), [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [error, setError] = useState("");
  const apply = () => {
    const range = calendarRange(mode, year, month, from, to);
    if (mode !== "all" && (!validISODate(range.from) || !validISODate(range.to) || range.from > range.to)) { setError("Choisissez une période valide, avec début et fin."); return; }
    setError(""); onChange(range);
  };
  return <fieldset className="flex flex-wrap items-center gap-2 text-xs">
    <legend className="sr-only">Période des commandes</legend>
    <span>Date de commande :</span>
    <select aria-label="Mode de période des commandes" value={mode} onChange={event => { setMode(event.target.value); setError(""); if (event.target.value === "all") onChange({ from: "", to: "" }); }} className="border rounded px-2 py-1.5">
      <option value="all">Toutes les dates</option><option value="year">Par année</option><option value="month">Par mois</option><option value="period">Période personnalisée</option>
    </select>
    {(mode === "year" || mode === "month") && <input aria-label="Année des commandes" type="number" min="1900" max="9999" value={year} onChange={event => setYear(event.target.value)} className="w-24 border rounded px-2 py-1.5" />}
    {mode === "month" && <select aria-label="Mois des commandes" value={month} onChange={event => setMonth(event.target.value)} className="border rounded px-2 py-1.5">{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, "0")}>{new Intl.DateTimeFormat("fr", { month: "long" }).format(new Date(2024, index, 1))}</option>)}</select>}
    {mode === "period" && <><label>Du <input aria-label="Début de période" type="date" value={from} onChange={event => setFrom(event.target.value)} className="border rounded px-2 py-1.5" /></label><label>au <input aria-label="Fin de période" type="date" value={to} onChange={event => setTo(event.target.value)} className="border rounded px-2 py-1.5" /></label></>}
    {mode !== "all" && <button type="button" onClick={apply} className="border rounded px-3 py-1.5">Appliquer la période</button>}
    {error && <span role="alert" className="text-red-700">{error}</span>}
  </fieldset>;
}
