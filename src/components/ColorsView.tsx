"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useColors } from "@/lib/color-context";
import { 
  AppColor, 
  COLOR_CATEGORIES, 
  DEFAULT_COLORS,
  isValidHexColor, 
  normalizeHexColor,
  getContrastTextColor,
  darkenColor,
  lightenColor,
} from "@/lib/color-utils";
import type { User } from "@/lib/types";

export default function ColorsView({ user }: { user: User }) {
  const { refreshColors } = useColors();
  const [colors, setColors] = useState<AppColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);

  const fetchColors = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ colors: AppColor[] }>("/api/colors");
      setColors(data.colors);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchColors();
  }, [fetchColors]);

  // Grouper les couleurs par catégorie
  const groupedColors = colors.reduce((acc, color) => {
    if (!acc[color.category]) {
      acc[color.category] = [];
    }
    acc[color.category].push(color);
    return acc;
  }, {} as Record<string, AppColor[]>);

  const startEdit = (color: AppColor) => {
    setEditingKey(color.key);
    setEditValue(color.color);
    setError("");
    setSuccess("");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
    setError("");
  };

  const saveColor = async (key: string) => {
    if (!isValidHexColor(editValue)) {
      setError("Code couleur invalide. Format attendu: #RRGGBB");
      return;
    }

    try {
      setSaving(key);
      setError("");
      const normalized = normalizeHexColor(editValue);
      
      await apiFetch("/api/colors", {
        method: "PUT",
        body: JSON.stringify({ key, color: normalized }),
      });

      // Mettre à jour localement
      setColors(prev => prev.map(c => 
        c.key === key ? { ...c, color: normalized } : c
      ));
      
      // Rafraîchir le context global
      await refreshColors();
      
      setEditingKey(null);
      setEditValue("");
      setSuccess(`Couleur "${key}" mise à jour avec succès`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de sauvegarde");
    } finally {
      setSaving(null);
    }
  };

  const restoreDefault = async (key: string) => {
    try {
      setSaving(key);
      setError("");
      
      await apiFetch("/api/colors", {
        method: "POST",
        body: JSON.stringify({ key }),
      });

      await fetchColors();
      await refreshColors();
      
      setSuccess(`Couleur "${key}" restaurée à sa valeur par défaut`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de restauration");
    } finally {
      setSaving(null);
    }
  };

  const restoreAllDefaults = async () => {
    try {
      setSaving("all");
      setError("");
      
      await apiFetch("/api/colors", {
        method: "POST",
        body: JSON.stringify({}),
      });

      await fetchColors();
      await refreshColors();
      
      setConfirmRestore(false);
      setSuccess("Toutes les couleurs ont été restaurées aux valeurs par défaut");
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de restauration");
    } finally {
      setSaving(null);
    }
  };

  const getDefaultColor = (key: string): string | null => {
    const def = DEFAULT_COLORS.find(c => c.key === key);
    return def?.color || null;
  };

  const isModified = (color: AppColor): boolean => {
    const def = getDefaultColor(color.key);
    return def !== null && def !== color.color;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">🎨 Gestion des Couleurs</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Personnalisez les couleurs des statuts et indicateurs de l'application
          </p>
        </div>
        <button
          onClick={() => setConfirmRestore(true)}
          disabled={saving === "all"}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Tout restaurer
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {success}
        </div>
      )}

      {/* Catégories de couleurs */}
      {Object.entries(groupedColors).map(([category, categoryColors]) => (
        <div key={category} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-800 dark:text-white">
              {COLOR_CATEGORIES[category] || category}
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {categoryColors.map(color => (
              <div key={color.key} className="px-6 py-4">
                <div className="flex items-center gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 dark:text-white">{color.label}</span>
                      {isModified(color) && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                          Modifié
                        </span>
                      )}
                    </div>
                    {color.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{color.description}</p>
                    )}
                    {color.updatedByName && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Modifié par {color.updatedByName}
                      </p>
                    )}
                  </div>

                  {/* Aperçu et édition */}
                  <div className="flex items-center gap-3">
                    {/* Aperçu du badge */}
                    <div
                      className="px-3 py-1.5 rounded-lg text-sm font-medium border"
                      style={{
                        backgroundColor: editingKey === color.key && isValidHexColor(editValue) 
                          ? normalizeHexColor(editValue) 
                          : color.color,
                        color: getContrastTextColor(
                          editingKey === color.key && isValidHexColor(editValue) 
                            ? normalizeHexColor(editValue) 
                            : color.color
                        ),
                        borderColor: darkenColor(
                          editingKey === color.key && isValidHexColor(editValue) 
                            ? normalizeHexColor(editValue) 
                            : color.color, 
                          20
                        ),
                      }}
                    >
                      Aperçu
                    </div>

                    {editingKey === color.key ? (
                      <>
                        {/* Color picker */}
                        <input
                          type="color"
                          value={isValidHexColor(editValue) ? normalizeHexColor(editValue) : color.color}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-10 h-10 rounded-lg cursor-pointer border-2 border-gray-300 dark:border-gray-600"
                        />
                        
                        {/* Input HEX */}
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                          placeholder="#RRGGBB"
                          className={`w-24 px-3 py-2 rounded-lg border text-sm font-mono ${
                            isValidHexColor(editValue)
                              ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                              : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
                          }`}
                        />

                        {/* Actions */}
                        <button
                          onClick={() => saveColor(color.key)}
                          disabled={!isValidHexColor(editValue) || saving === color.key}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                        >
                          {saving === color.key ? "..." : "✓"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Affichage de la couleur actuelle */}
                        <div
                          className="w-10 h-10 rounded-lg border-2 border-gray-300 dark:border-gray-600"
                          style={{ backgroundColor: color.color }}
                          title={color.color}
                        />
                        <span className="font-mono text-sm text-gray-600 dark:text-gray-400 w-20">
                          {color.color}
                        </span>

                        {/* Actions */}
                        <button
                          onClick={() => startEdit(color)}
                          className="px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-sm hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        >
                          Modifier
                        </button>
                        {isModified(color) && (
                          <button
                            onClick={() => restoreDefault(color.key)}
                            disabled={saving === color.key}
                            className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                            title={`Restaurer à ${getDefaultColor(color.key)}`}
                          >
                            ↺
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Légende */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
        <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">💡 Conseils</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• La couleur du texte est calculée automatiquement pour garantir une bonne lisibilité</li>
          <li>• Les modifications sont appliquées immédiatement dans toute l'application</li>
          <li>• Utilisez des couleurs contrastées pour une meilleure accessibilité</li>
          <li>• Cliquez sur "↺" pour restaurer une couleur à sa valeur par défaut</li>
        </ul>
      </div>

      {/* Modal de confirmation */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmRestore(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              Restaurer toutes les couleurs ?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Cette action va réinitialiser toutes les couleurs à leurs valeurs par défaut. 
              Les personnalisations actuelles seront perdues.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmRestore(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Annuler
              </button>
              <button
                onClick={restoreAllDefaults}
                disabled={saving === "all"}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving === "all" ? "Restauration..." : "Confirmer la restauration"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
