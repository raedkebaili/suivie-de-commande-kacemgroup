"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { useColors } from "@/lib/color-context";
import { getContrastTextColor } from "@/lib/color-utils";
import {
  ARCHIVE_CELL_PALETTE,
  ARCHIVE_STATES,
  ARCHIVE_STATE_BY_KEY,
  archiveStateLabel,
} from "@/lib/archive-constants";

type Sheet = { id: number; name: string; sourceFilename: string | null; rowCount: number; importedByName: string | null; createdAt: string };
type Row = { id: number; rowIndex: number; cells: string[]; stateOverride: string | null; stateDetected?: string | null; state: string | null; stateSource?: string; updatedByName: string | null; cellColors: Record<number, string> };
type Pagination = { page: number; pageSize: number; total: number; pages: number };

/**
 * Onglet « Archive commandes » — module indépendant.
 * Affiche les anciennes commandes importées depuis Excel, organisées par
 * période (feuille). Consultation ouverte à tous les utilisateurs
 * authentifiés ; import et personnalisation réservés au superadmin
 * (contrôlé côté serveur par les routes /api/archive/*).
 */
// Origine de l'état affiché (priorité : manuel > fichier Excel > règle automatique)
const STATE_SOURCE_BADGE: Record<string, string> = {
  manuel: "✎",
  fichier: "📄",
  auto: "⚙",
  aucun: "",
};
const STATE_SOURCE_HINT: Record<string, string> = {
  manuel: "État modifié manuellement (prioritaire)",
  fichier: "État lu dans le fichier Excel importé — modifiable",
  auto: "État déduit automatiquement (Reste à livrer = 0) — modifiable",
  aucun: "Aucun état — sélectionnez-en un si nécessaire",
};

// Un « span » fusionne les lignes successives d'un même Client.
// span: "first" = rend la cellule fusionnée (rowSpan), "mid" = masquée (couvert par le rowSpan),
// "single" = cellule normale. groupLen = taille du groupe (pour le rowSpan).
type Bar = { span: "single" | "first" | "mid"; groupLen: number };

/**
 * Calcule les fusions verticales de la colonne « Clients ».
 * Règle spéciale lignes complémentaires : une ligne dont la cellule Clients est
 * vide mais dont le reste contient des données (ligne complémentaire d'une même
 * commande) ne casse PAS le groupe. Une ligne entièrement vide, elle, le casse.
 * Deux groupes distincts portant le même nom ne sont jamais fusionnés.
 */
function computeClientBars(rows: Row[], clientsIdx: number | null): Bar[] {
  const n = rows.length;
  const bars: Bar[] = Array.from({ length: n }, () => ({ span: "single" as const, groupLen: 1 }));
  if (clientsIdx === null || clientsIdx === undefined) return bars;

  const isEmptyRow = (r: Row) => r.cells.every((c) => (c || "").trim() === ""); // ligne totalement vide
  const isEmptyClient = (r: Row) => (r.cells[clientsIdx] || "").trim() === "" && !isEmptyRow(r); // ligne complémentaire
  // Comparaison insensible à la casse et aux espaces multiples (« EMB » = « emb  »)
  const val = (r: Row) => (r.cells[clientsIdx] || "").trim().replace(/\s+/g, " ").toUpperCase();

  let i = 0;
  while (i < n) {
    const v = val(rows[i]);
    if (v === "") { i++; continue; }
    // Étendre le groupe tant que valeur identique ou ligne complémentaire,
    // sans dépasser une valeur DIFFÉRENTE. Un groupe peut contenir des lignes
    // complémentaires (y compris en fin) tant qu'une ligne « v » existe encore.
    let end = i;
    let j = i + 1;
    while (j < n) {
      const vj = val(rows[j]);
      if (vj === v) { end = j; j++; continue; }
      if (isEmptyClient(rows[j])) {
        // Ligne complémentaire : ne prolonge le groupe que si « v » réapparaît
        // plus loin avant toute autre valeur ; sinon le groupe s'arrête ici.
        let finds = false;
        for (let k = j + 1; k < n; k++) {
          const vk = val(rows[k]);
          if (vk === v) { finds = true; break; }
          if (vk !== "" || isEmptyRow(rows[k])) break;
        }
        if (finds) { end = j; j++; continue; }
        break;
      }
      break;
    }
    const groupLen = end - i + 1;
    bars[i] = { span: groupLen > 1 ? "first" : "single", groupLen };
    for (let k = i + 1; k <= end; k++) bars[k] = { span: "mid", groupLen };
    i = end + 1;
  }
  return bars;
}

export default function ArchiveView({ user }: { user: User }) {
  const isAdmin = user.role === "superadmin";
  const canEditArchive = ["superadmin", "planification", "technique"].includes(user.role);
  const { getColor } = useColors();

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [clientsColumnIndex, setClientsColumnIndex] = useState<number | null>(null);
  const [affaireColumnIndex, setAffaireColumnIndex] = useState<number | null>(null);
  const [stateColumnIndex, setStateColumnIndex] = useState<number | null>(null);
  const [preamble, setPreamble] = useState<string[][]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 100, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filtres
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [page, setPage] = useState(1);

  // Import (admin)
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Éditeurs de la ligne d'archive et de couleur de cellule
  const [rowEditor, setRowEditor] = useState<{ rowId: number; cells: string[] } | null>(null);
  const [savingRow, setSavingRow] = useState(false);
  const [cellEditor, setCellEditor] = useState<{ rowId: number; columnIndex: number; current?: string } | null>(null);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(""), 4000); };

  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);

  const loadSheets = useCallback(async () => {
    try {
      const d = await apiFetch<{ sheets: Sheet[] }>("/api/archive/sheets");
      setSheets(d.sheets);
      setSheetId(prev => (prev && d.sheets.some(s => s.id === prev) ? prev : d.sheets[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  const loadRows = useCallback(async () => {
    if (!sheetId) { setRows([]); setColumns([]); setPreamble([]); return; }
    setLoadingRows(true);
    try {
      const p = new URLSearchParams({ sheetId: String(sheetId), page: String(page), pageSize: "100" });
      if (debounced.trim().length >= 2) p.set("q", debounced.trim());
      if (stateFilter) p.set("state", stateFilter);
      const d = await apiFetch<{ columns: string[]; preamble: string[][]; rows: Row[]; pagination: Pagination; sheet: { clientsColumnIndex: number | null; affaireColumnIndex: number | null; stateColumnIndex: number | null } }>(`/api/archive/rows?${p}`);
      setColumns(d.columns); setPreamble(d.preamble || []); setRows(d.rows); setPagination(d.pagination);
      setClientsColumnIndex(d.sheet?.clientsColumnIndex ?? null);
      setAffaireColumnIndex(d.sheet?.affaireColumnIndex ?? null);
      setStateColumnIndex(d.sheet?.stateColumnIndex ?? null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoadingRows(false);
    }
  }, [sheetId, page, debounced, stateFilter]);

  useEffect(() => { loadRows(); }, [loadRows]);

  useEffect(() => {
    if (!isTableFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsTableFullscreen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTableFullscreen]);

  const doImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Sélectionnez un fichier Excel"); return; }
    setImporting(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (replaceExisting) fd.append("replace", "1");
      const r = await apiFetch<{ sheets: { sheet: string; rows: number }[]; totalRows: number }>("/api/archive/import", { method: "POST", body: fd });
      flash(`Archive importée : ${r.sheets.length} feuille(s), ${r.totalRows} ligne(s)`);
      if (fileRef.current) fileRef.current.value = "";
      await loadSheets();
      setPage(1);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'import");
    } finally {
      setImporting(false);
    }
  };

  /** Supprime TOUTES les archives (toutes les feuilles du classeur) — admin */
  const deleteAllSheets = async () => {
    const total = sheets.reduce((sum, s) => sum + s.rowCount, 0);
    if (!confirm(`Supprimer TOUTES les archives ?\n\n${sheets.length} feuille(s) et ${total} ligne(s) seront définitivement supprimées, ainsi que les états et couleurs personnalisées associés.\n\nLes commandes actives ne sont PAS concernées.`)) return;
    if (!confirm("Confirmation finale : cette action est irréversible. Continuer ?")) return;
    try {
      const r = await apiFetch<{ deleted: number }>("/api/archive/sheets?all=1", { method: "DELETE" });
      flash(`${r.deleted} feuille(s) d'archive supprimée(s)`);
      setSheetId(null); setRows([]); setColumns([]); setPreamble([]);
      await loadSheets();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  const deleteSheet = async (s: Sheet) => {
    if (!confirm(`Supprimer définitivement l'archive « ${s.name} » (${s.rowCount} lignes) ?\n\nLes commandes actives ne sont pas concernées.`)) return;
    try {
      await apiFetch(`/api/archive/sheets?id=${s.id}`, { method: "DELETE" });
      flash("Archive supprimée");
      setSheetId(null);
      await loadSheets();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
  };

  const setRowState = async (row: Row, state: string | null) => {
    const prev = rows;
    // Mise à jour optimiste — les couleurs de cellules ne sont jamais touchées
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, stateOverride: state, state: state ?? r.state } : r));
    try {
      const d = await apiFetch<{ row: { stateOverride: string | null; state: string | null } }>(`/api/archive/rows/${row.id}`, {
        method: "PUT", body: JSON.stringify({ state }),
      });
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, stateOverride: d.row.stateOverride, state: d.row.state } : r));
    } catch (err) {
      setRows(prev);
      alert(err instanceof Error ? err.message : "Erreur");
    }
  };

  const saveRowCells = async () => {
    if (!rowEditor || !canEditArchive) return;
    const previousRows = rows;
    setSavingRow(true);
    setRows(current => current.map(row => row.id === rowEditor.rowId ? { ...row, cells: rowEditor.cells } : row));
    try {
      const response = await apiFetch<{ row: { id: number; cells: string[]; stateOverride: string | null; state: string | null; stateSource?: string; updatedByName: string | null } }>(`/api/archive/rows/${rowEditor.rowId}`, {
        method: "PUT",
        body: JSON.stringify({ cells: rowEditor.cells }),
      });
      setRows(current => current.map(row => row.id === rowEditor.rowId ? { ...row, ...response.row } : row));
      setRowEditor(null);
      flash("Ligne d'archive modifiée");
    } catch (err) {
      setRows(previousRows);
      setError(err instanceof Error ? err.message : "Erreur lors de la modification de la ligne");
    } finally {
      setSavingRow(false);
    }
  };

  const setCellColor = async (rowId: number, columnIndex: number, color: string | null) => {
    const prev = rows;
    setRows(rs => rs.map(r => {
      if (r.id !== rowId) return r;
      const next = { ...r.cellColors };
      if (color) next[columnIndex] = color; else delete next[columnIndex];
      return { ...r, cellColors: next };
    }));
    setCellEditor(null);
    try {
      await apiFetch("/api/archive/cell-colors", { method: "PUT", body: JSON.stringify({ rowId, columnIndex, color }) });
    } catch (err) {
      setRows(prev);
      alert(err instanceof Error ? err.message : "Erreur");
    }
  };

  /** Couleur de fond d'une ligne selon son état (clés ARCHIVE_* isolées) */
  const rowStyle = (state: string | null) => {
    if (!state) return undefined;
    const def = ARCHIVE_STATE_BY_KEY[state];
    if (!def) return undefined;
    const bg = getColor(def.colorKey);
    return { backgroundColor: bg, color: getContrastTextColor(bg) };
  };

  /** Priorité : couleur personnalisée de la cellule > couleur de l'état de la ligne */
  const cellStyle = (row: Row, columnIndex: number) => {
    const custom = row.cellColors[columnIndex];
    if (custom) return { backgroundColor: custom, color: getContrastTextColor(custom) };
    return undefined; // hérite du style de la ligne
  };

  const currentSheet = useMemo(() => sheets.find(s => s.id === sheetId) || null, [sheets, sheetId]);

  // Fusions verticales : colonne « Clients » ET colonne « Affaire »
  // (recalculées à chaque page de données, indépendamment l'une de l'autre)
  const clientBars = useMemo(() => computeClientBars(rows, clientsColumnIndex), [rows, clientsColumnIndex]);
  const affaireBars = useMemo(() => computeClientBars(rows, affaireColumnIndex), [rows, affaireColumnIndex]);
  /** Retourne la fusion applicable à une colonne donnée, ou null si non fusionnée */
  const barFor = (ci: number, ri: number): Bar | null => {
    if (clientsColumnIndex !== null && ci === clientsColumnIndex) return clientBars[ri] ?? null;
    if (affaireColumnIndex !== null && ci === affaireColumnIndex) return affaireBars[ri] ?? null;
    return null;
  };

  return (
    <div className={`archive-content space-y-4 ${isTableFullscreen ? "fixed inset-0 z-[60] overflow-auto bg-gray-50 dark:bg-gray-950 p-3 sm:p-4" : ""}`}>
      {/* En-tête */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">📁 Archive commandes</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Anciennes commandes importées depuis Excel — séparées du suivi actif.</p>
          {canEditArchive && <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">✎ Modification des lignes autorisée pour votre rôle.</p>}
        </div>
        <button onClick={() => setIsTableFullscreen(value => !value)}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          title={isTableFullscreen ? "Quitter le plein écran" : "Afficher l'archive en plein écran"}>
          {isTableFullscreen ? "⤢ Quitter plein écran" : "⛶ Plein écran"}
        </button>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="file" accept=".xlsx,.xls" ref={fileRef} className="text-sm text-gray-600 dark:text-gray-300" />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer" title="Remplacer une feuille portant le même nom au lieu de créer un doublon">
              <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} className="accent-blue-600" />
              Remplacer si existante
            </label>
            <button onClick={doImport} disabled={importing}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
              {importing ? "Import en cours..." : "📥 Importer une archive Excel"}
            </button>
            {sheets.length > 0 && (
              <button onClick={deleteAllSheets}
                title="Supprimer toutes les feuilles d'archive (les commandes actives ne sont pas concernées)"
                className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                🗑️ Tout supprimer
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {notice && <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">{notice}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
      ) : sheets.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 py-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucune archive importée.</p>
          {isAdmin
            ? <p className="text-xs text-gray-400 mt-1">Importez le classeur Excel des anciennes commandes pour commencer.</p>
            : <p className="text-xs text-gray-400 mt-1">L&apos;administrateur doit importer le fichier d&apos;archive.</p>}
        </div>
      ) : (
        <>
          {/* Sélection de période + filtres */}
          <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800 flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Période / feuille</label>
            <select value={sheetId ?? ""} onChange={e => { setSheetId(parseInt(e.target.value)); setPage(1); }}
              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 max-w-xs">
              {sheets.map(s => <option key={s.id} value={s.id}>{s.name} ({s.rowCount})</option>)}
            </select>

            <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
              <option value="">Tous les états</option>
              {ARCHIVE_STATES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              <option value="NONE">Sans état</option>
            </select>

            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher dans la feuille..."
              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-64 text-gray-700 dark:text-gray-200" />

            <button onClick={loadRows} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-300">🔄 Actualiser</button>
            <div className="flex-1" />
            {currentSheet && (
              <span className="text-[11px] text-gray-400">
                {currentSheet.sourceFilename ? `Source : ${currentSheet.sourceFilename}` : ""}
                {currentSheet.importedByName ? ` • importé par ${currentSheet.importedByName}` : ""}
              </span>
            )}
            {isAdmin && currentSheet && (
              <button onClick={() => deleteSheet(currentSheet)} className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100">🗑️ Supprimer cette feuille</button>
            )}
          </div>

          {/* Légende des états (couleurs ARCHIVE isolées) */}
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-600 dark:text-gray-300">
            <span className="font-semibold">Légende :</span>
            {ARCHIVE_STATES.map(s => {
              const bg = getColor(s.colorKey);
              return <span key={s.key} className="px-2 py-0.5 rounded border border-black/10" style={{ backgroundColor: bg, color: getContrastTextColor(bg) }}>{s.label}</span>;
            })}
            <span className="text-gray-400 italic">
              États : 📄 lu dans le fichier · ⚙ auto (Reste à livrer = 0) · ✎ modifié manuellement — tous modifiables
            </span>
            {isAdmin && <span className="text-gray-400 italic">• Clic droit sur une cellule = couleur personnalisée</span>}
            {stateColumnIndex !== null && (
              <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                Colonne « {columns[stateColumnIndex]} » du fichier utilisée comme état
              </span>
            )}
            {(clientsColumnIndex !== null || affaireColumnIndex !== null) && (
              <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                Fusion verticale : {[clientsColumnIndex !== null ? columns[clientsColumnIndex] : null, affaireColumnIndex !== null ? columns[affaireColumnIndex] : null].filter(Boolean).join(" + ")}
              </span>
            )}
          </div>

          {/* Lignes complémentaires de la feuille d'origine */}
          {preamble.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
              <div className="font-semibold mb-1">Informations d&apos;origine de la feuille</div>
              {preamble.map((line, i) => (
                <div key={i} className="truncate">{line.filter(c => c.trim() !== "").join(" · ")}</div>
              ))}
            </div>
          )}

          {/* Tableau reproduisant la structure Excel */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className={`overflow-x-auto mobile-scroll-x ${isTableFullscreen ? "max-h-[calc(100vh-210px)]" : "max-h-[65vh]"}`}>
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-600 text-left">
                    <th className="px-2 py-2 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">#</th>
                    {columns.map((c, i) => (
                      <th key={i} className="px-2 py-2 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap border-l border-gray-200 dark:border-gray-700">{c}</th>
                    ))}
                    <th className="px-2 py-2 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap border-l-2 border-gray-400 dark:border-gray-500 bg-gray-200 dark:bg-gray-700">État</th>
                    {canEditArchive && <th className="px-2 py-2 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {loadingRows ? (
                    <tr><td colSpan={columns.length + (canEditArchive ? 3 : 2)} className="text-center py-10 text-gray-400">Chargement...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={columns.length + (canEditArchive ? 3 : 2)} className="text-center py-10 text-gray-400">Aucune ligne pour ces critères</td></tr>
                  ) : rows.map((r, ri) => {
                    const rs = rowStyle(r.state);
                    return (
                      <tr key={r.id} style={rs} className={`border-b border-gray-200 dark:border-gray-700 ${rs ? "" : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-200"}`}>
                        <td className="px-2 py-1 text-[10px] opacity-60 whitespace-nowrap">{r.rowIndex + 1}</td>
                        {columns.map((_, ci) => {
                          // Colonnes « Clients » et « Affaire » : fusion verticale
                          // réelle (rowSpan) + centrage, comme dans Excel.
                          const bar = barFor(ci, ri);
                          if (bar) {
                            if (bar.span === "mid") return null; // couverte par la cellule fusionnée
                            const cs = cellStyle(r, ci);
                            const merged = bar.groupLen > 1;
                            return (
                              <td key={ci} style={cs} rowSpan={bar.groupLen}
                                className={`px-2 py-1 border-l border-black/10 dark:border-white/10 align-middle text-center whitespace-nowrap ${merged ? "font-bold border-y border-black/20 dark:border-white/20" : ""} ${isAdmin ? "cursor-context-menu" : ""}`}
                                title={merged ? `${r.cells[ci] || ""} — ${bar.groupLen} lignes regroupées` : (r.cells[ci] || "")}
                                onContextMenu={isAdmin ? (e) => { e.preventDefault(); setCellEditor({ rowId: r.id, columnIndex: ci, current: r.cellColors[ci] }); } : undefined}>
                                {r.cells[ci] ?? ""}
                                {merged && <span className="block text-[9px] font-normal opacity-60">({bar.groupLen})</span>}
                              </td>
                            );
                          }
                          const cs = cellStyle(r, ci);
                          return (
                            <td key={ci} style={cs}
                              className={`px-2 py-1 border-l border-black/10 dark:border-white/10 whitespace-nowrap max-w-[240px] truncate ${isAdmin ? "cursor-context-menu" : ""}`}
                              title={r.cells[ci] || ""}
                              onContextMenu={isAdmin ? (e) => { e.preventDefault(); setCellEditor({ rowId: r.id, columnIndex: ci, current: r.cellColors[ci] }); } : undefined}>
                              {r.cells[ci] ?? ""}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 border-l-2 border-black/20 dark:border-white/20 whitespace-nowrap">
                          {isAdmin ? (
                            <span className="inline-flex items-center gap-1">
                              <select value={r.stateOverride ?? ""} onChange={e => setRowState(r, e.target.value || null)}
                                title={STATE_SOURCE_HINT[r.stateSource || "aucun"]}
                                className="text-[11px] px-1 py-0.5 rounded border border-black/20 bg-white/80 text-black">
                                {/* Valeur vide = automatique : état du fichier, sinon règle Reste à livrer = 0 */}
                                <option value="">{r.state ? `Auto (${archiveStateLabel(r.state)})` : "Auto (—)"}</option>
                                {ARCHIVE_STATES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                              </select>
                              <span className="text-[9px] opacity-70" title={STATE_SOURCE_HINT[r.stateSource || "aucun"]}>
                                {STATE_SOURCE_BADGE[r.stateSource || "aucun"]}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold inline-flex items-center gap-1">
                              {archiveStateLabel(r.state)}
                              <span className="text-[9px] opacity-70" title={STATE_SOURCE_HINT[r.stateSource || "aucun"]}>
                                {STATE_SOURCE_BADGE[r.stateSource || "aucun"]}
                              </span>
                            </span>
                          )}
                        </td>
                        {canEditArchive && <td className="px-2 py-1 border-l border-black/10 dark:border-white/10 whitespace-nowrap">
                          <button onClick={() => setRowEditor({ rowId: r.id, cells: [...r.cells] })}
                            className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700">✎ Modifier</button>
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-gray-600 dark:text-gray-300">
            <span>{pagination.total} ligne(s) — page {pagination.page} / {pagination.pages}</span>
            <div className="flex gap-1">
              <button disabled={pagination.page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">← Précédent</button>
              <button disabled={pagination.page >= pagination.pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">Suivant →</button>
            </div>
          </div>
        </>
      )}

      {/* Éditeur des champs de ligne (planification, technique, superadmin) */}
      {rowEditor && canEditArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => !savingRow && setRowEditor(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h4 className="text-base font-semibold text-gray-800 dark:text-white">Modifier la ligne d&apos;archive</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Les données originales de l&apos;archive sont modifiées sans toucher aux commandes actives.</p>
              </div>
              <button onClick={() => setRowEditor(null)} disabled={savingRow} className="text-xl text-gray-500 hover:text-gray-800 disabled:opacity-40">×</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {columns.map((column, columnIndex) => (
                <label key={columnIndex} className="text-xs text-gray-700 dark:text-gray-300">
                  <span className="block font-semibold mb-1">{column}</span>
                  <textarea value={rowEditor.cells[columnIndex] ?? ""}
                    onChange={event => setRowEditor(current => current ? { ...current, cells: current.cells.map((cell, index) => index === columnIndex ? event.target.value : cell) } : current)}
                    rows={2}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm resize-y" />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setRowEditor(null)} disabled={savingRow} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40">Annuler</button>
              <button onClick={saveRowCells} disabled={savingRow} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{savingRow ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Éditeur de couleur de cellule (admin) */}
      {cellEditor && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCellEditor(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Couleur personnalisée de la cellule</h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
              Colonne « {columns[cellEditor.columnIndex]} ». Cette couleur est prioritaire sur celle de l&apos;état et sera conservée si l&apos;état change.
            </p>
            <div className="grid grid-cols-6 gap-2 mb-4">
              {ARCHIVE_CELL_PALETTE.map(p => (
                <button key={p.color} title={p.label} onClick={() => setCellColor(cellEditor.rowId, cellEditor.columnIndex, p.color)}
                  className={`w-9 h-9 rounded-lg border-2 transition-all ${cellEditor.current?.toLowerCase() === p.color.toLowerCase() ? "border-blue-500 ring-2 ring-blue-300" : "border-gray-300 dark:border-gray-600 hover:scale-110"}`}
                  style={{ backgroundColor: p.color }} />
              ))}
            </div>
            <div className="flex items-center gap-2 mb-4">
              <input type="color" defaultValue={cellEditor.current || "#3b82f6"}
                onChange={e => setCellEditor(c => c ? { ...c, current: e.target.value } : c)}
                className="w-10 h-9 rounded cursor-pointer border border-gray-300 dark:border-gray-600" />
              <button onClick={() => setCellColor(cellEditor.rowId, cellEditor.columnIndex, cellEditor.current || "#3b82f6")}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Appliquer cette couleur</button>
            </div>
            <div className="flex justify-between gap-2">
              <button onClick={() => setCellColor(cellEditor.rowId, cellEditor.columnIndex, null)}
                className="px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                Retirer la personnalisation
              </button>
              <button onClick={() => setCellEditor(null)} className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
