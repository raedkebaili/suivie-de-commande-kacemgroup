"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import MaterialAutocomplete from "./MaterialAutocomplete";

export type MaterialCategory = {
  id: number;
  key: string;
  name: string;
  isTelegestion: boolean;
  active: boolean;
  sortOrder: number;
};
export type Matiere = {
  id: number;
  categoryId: number | null;
  category: string;
  reference: string;
  name: string;
  stock: number;
  specs: string | null;
};

export default function MatiereView({ user: _user }: { user: User }) {
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [materials, setMaterials] = useState<Matiere[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState("");
  const [form, setForm] = useState({ reference: "", label: "", stock: "0", specs: "" });
  const [editing, setEditing] = useState<Matiere | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<MaterialCategory | null>(null);
  const [categoryInfo, setCategoryInfo] = useState<{ matieresCount: number; usageCount: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const showMessage = (msg: string, type: "success" | "error" | "info" = "info") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  const fetchCategories = useCallback(async () => {
    const data = await apiFetch<{ categories: MaterialCategory[] }>("/api/material-categories");
    setCategories(data.categories.filter(category => category.active));
    setSelectedCategoryId(current => current || data.categories.find(category => category.active)?.id || null);
  }, []);

  const fetchMaterials = useCallback(async () => {
    if (!selectedCategoryId) { setMaterials([]); return; }
    const data = await apiFetch<{ matieres: Matiere[] }>(`/api/matieres?categoryId=${selectedCategoryId}`);
    setMaterials(data.matieres);
  }, [selectedCategoryId]);

  useEffect(() => { fetchCategories().catch(() => showMessage("Impossible de charger les catégories", "error")); }, [fetchCategories]);
  useEffect(() => { setLoading(true); fetchMaterials().finally(() => setLoading(false)); }, [fetchMaterials]);

  const selectedCategory = categories.find(category => category.id === selectedCategoryId);

  // Filtrer les matières selon la recherche
  const filteredMaterials = searchQuery.length >= 1
    ? materials.filter(m => 
        m.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.specs || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : materials;

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const data = await apiFetch<{ category: MaterialCategory }>("/api/material-categories", {
        method: "POST",
        body: JSON.stringify({ name: newCategory.trim() }),
      });
      setNewCategory("");
      await fetchCategories();
      setSelectedCategoryId(data.category.id);
      showMessage("Catégorie ajoutée avec succès.", "success");
    } catch (error) { showMessage(error instanceof Error ? error.message : "Erreur", "error"); }
  };

  // Fonction pour préparer la suppression d'une catégorie
  const prepareDeleteCategory = async (category: MaterialCategory) => {
    setDeletingCategory(category);
    try {
      const info = await apiFetch<{ category: MaterialCategory; matieresCount: number; usageCount: number }>(
        `/api/material-categories/${category.id}`
      );
      setCategoryInfo({ matieresCount: info.matieresCount, usageCount: info.usageCount });
      setShowDeleteConfirm(true);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Erreur lors de la vérification", "error");
    }
  };

  // Fonction pour confirmer la suppression
  const confirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    try {
      const result = await apiFetch<{ success: boolean; message: string; archived?: boolean; deleted?: boolean }>(
        `/api/material-categories/${deletingCategory.id}`,
        { method: "DELETE" }
      );
      showMessage(result.message, "success");
      setShowDeleteConfirm(false);
      setDeletingCategory(null);
      setCategoryInfo(null);
      await fetchCategories();
      if (selectedCategoryId === deletingCategory.id) {
        setSelectedCategoryId(null);
      }
    } catch (error) {
      const errorData = error as { matieresCount?: number };
      if (errorData.matieresCount) {
        showMessage(`La catégorie contient ${errorData.matieresCount} matière(s). Supprimez-les d'abord.`, "error");
      } else {
        showMessage(error instanceof Error ? error.message : "Erreur lors de la suppression", "error");
      }
    }
  };

  const saveMaterial = async () => {
    if (!selectedCategoryId || !form.reference.trim() || !form.label.trim()) return;
    try {
      if (editing) {
        await apiFetch("/api/matieres", {
          method: "PATCH",
          body: JSON.stringify({ id: editing.id, reference: form.reference, label: form.label, stock: form.stock, specs: form.specs }),
        });
      } else {
        await apiFetch("/api/matieres", {
          method: "POST",
          body: JSON.stringify({ categoryId: selectedCategoryId, reference: form.reference, label: form.label, stock: form.stock, specs: form.specs }),
        });
      }
      setForm({ reference: "", label: "", stock: "0", specs: "" });
      setEditing(null);
      showMessage(editing ? "Matière modifiée." : "Matière ajoutée.", "success");
      fetchMaterials();
    } catch (error) { showMessage(error instanceof Error ? error.message : "Erreur", "error"); }
  };

  const startEdit = (material: Matiere) => {
    setEditing(material);
    setForm({ reference: material.reference, label: material.name, stock: String(material.stock), specs: material.specs || "" });
  };

  const updateStock = async (material: Matiere, stock: string) => {
    try {
      await apiFetch("/api/matieres", { method: "PATCH", body: JSON.stringify({ id: material.id, stock }) });
      fetchMaterials();
    } catch (error) { showMessage(error instanceof Error ? error.message : "Erreur stock", "error"); }
  };

  const archive = async (id: number) => {
    if (!confirm("Retirer cette matière de la liste ? Les sélections historiques seront conservées.")) return;
    await apiFetch("/api/matieres", { method: "DELETE", body: JSON.stringify({ id }) });
    fetchMaterials();
  };

  const importFile = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !selectedCategoryId) return;
    const data = new FormData();
    data.append("file", file);
    data.append("categoryId", String(selectedCategoryId));
    try {
      const result = await apiFetch<{ imported: number; skipped: number }>("/api/matieres", { method: "PUT", body: data });
      showMessage(`${result.imported} matière(s) importée(s), ${result.skipped} ligne(s) ignorée(s).`, "success");
      if (fileRef.current) fileRef.current.value = "";
      fetchMaterials();
    } catch (error) { showMessage(error instanceof Error ? error.message : "Erreur import", "error"); }
  };

  return (
    <div className="space-y-5 text-black">
      <div>
        <h3 className="text-xl font-bold text-black">Table Matières</h3>
        <p className="text-sm text-black mt-1">Bibliothèque technique par catégorie : référence, libellé et stock indicatif.</p>
      </div>

      {message && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${
          messageType === "success" ? "bg-green-100 border-green-400 text-green-800" :
          messageType === "error" ? "bg-red-100 border-red-400 text-red-800" :
          "bg-gray-100 border-gray-400 text-black"
        }`}>
          {messageType === "success" && "✓ "}
          {messageType === "error" && "✗ "}
          {message}
        </div>
      )}

      {/* Section Catégories */}
      <section className="rounded-xl border border-gray-300 bg-white p-4">
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <label className="flex-1 min-w-56">
            <span className="block text-xs font-semibold mb-1">Ajouter une catégorie</span>
            <input 
              value={newCategory} 
              onChange={event => setNewCategory(event.target.value)} 
              onKeyDown={e => e.key === "Enter" && addCategory()}
              placeholder="Nom de la nouvelle catégorie" 
              className="w-full rounded-lg border border-gray-400 px-3 py-2 text-sm bg-white text-black" 
            />
          </label>
          <button onClick={addCategory} disabled={!newCategory.trim()} className="rounded-lg border border-gray-700 bg-gray-200 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
            + Ajouter la catégorie
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map(category => (
            <div key={category.id} className="relative group">
              <button 
                onClick={() => setSelectedCategoryId(category.id)} 
                className={`rounded-full border px-3 py-2 text-sm font-semibold text-black pr-8 ${
                  selectedCategoryId === category.id ? "bg-amber-300 border-amber-700" : "bg-gray-100 border-gray-400"
                }`}
              >
                {category.isTelegestion ? "📡 " : ""}{category.name}
              </button>
              {/* Bouton supprimer (visible au survol, double-clic requis pour sécurité) */}
              <button
                onClick={(e) => { e.stopPropagation(); }}
                onDoubleClick={(e) => { e.stopPropagation(); prepareDeleteCategory(category); }}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                title="Double-cliquez pour supprimer cette catégorie"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Modal de confirmation de suppression */}
      {showDeleteConfirm && deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-black mb-4">
              Supprimer la catégorie "{deletingCategory.name}" ?
            </h3>
            
            {categoryInfo && (
              <div className="mb-4 space-y-2">
                <div className={`p-3 rounded-lg ${categoryInfo.matieresCount > 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                  <p className="text-sm">
                    <strong>Matières dans cette catégorie :</strong> {categoryInfo.matieresCount}
                  </p>
                  {categoryInfo.matieresCount > 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      ⚠️ Vous devez d'abord supprimer ou réaffecter les matières.
                    </p>
                  )}
                </div>
                <div className={`p-3 rounded-lg ${categoryInfo.usageCount > 0 ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
                  <p className="text-sm">
                    <strong>Utilisations dans les commandes :</strong> {categoryInfo.usageCount}
                  </p>
                  {categoryInfo.usageCount > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      ℹ️ La catégorie sera archivée pour conserver l'historique.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeletingCategory(null); setCategoryInfo(null); }}
                className="px-4 py-2 rounded-lg border border-gray-400 bg-white text-black text-sm"
              >
                Annuler
              </button>
              <button
                onClick={confirmDeleteCategory}
                disabled={categoryInfo?.matieresCount ? categoryInfo.matieresCount > 0 : false}
                className="px-4 py-2 rounded-lg border border-red-700 bg-red-500 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {categoryInfo?.usageCount && categoryInfo.usageCount > 0 ? "Archiver" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCategory && (
        <>
          <section className={`rounded-xl border-2 p-4 ${selectedCategory.isTelegestion ? "bg-sky-100 border-sky-600" : "bg-white border-gray-300"}`}>
            <h4 className="font-bold text-black">{selectedCategory.isTelegestion ? "📡 Accessoire de télégestion" : selectedCategory.name}</h4>
            <p className="text-xs text-black mt-1">Ces matières seront proposées automatiquement dans le formulaire Technique de chaque article.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => window.open(`/api/templates?type=matieres&category=${encodeURIComponent(selectedCategory.key)}`, "_blank")} className="rounded-lg border border-gray-500 bg-gray-200 px-3 py-2 text-xs font-semibold text-black">Télécharger le modèle Excel</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="text-sm text-black" />
              <button onClick={importFile} className="rounded-lg border border-gray-700 bg-gray-300 px-3 py-2 text-xs font-semibold text-black">Importer dans cette catégorie</button>
            </div>
          </section>

          <section className="rounded-xl border border-gray-300 bg-white p-4">
            <h4 className="font-bold text-black mb-3">{editing ? "Modifier la matière" : "Ajouter une matière"}</h4>
            <div className="grid gap-3 md:grid-cols-4">
              <label><span className="block text-xs font-semibold mb-1">Référence *</span><input value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} className="w-full rounded-lg border border-gray-400 px-3 py-2 text-sm bg-white text-black" /></label>
              <label><span className="block text-xs font-semibold mb-1">Libellé *</span><input value={form.label} onChange={event => setForm(current => ({ ...current, label: event.target.value }))} className="w-full rounded-lg border border-gray-400 px-3 py-2 text-sm bg-white text-black" /></label>
              <label><span className="block text-xs font-semibold mb-1">Stock indicatif</span><input type="number" step="any" value={form.stock} onChange={event => setForm(current => ({ ...current, stock: event.target.value }))} className="w-full rounded-lg border border-gray-400 px-3 py-2 text-sm bg-white text-black" /></label>
              <label><span className="block text-xs font-semibold mb-1">Spécifications</span><input value={form.specs} onChange={event => setForm(current => ({ ...current, specs: event.target.value }))} className="w-full rounded-lg border border-gray-400 px-3 py-2 text-sm bg-white text-black" /></label>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={saveMaterial} className="rounded-lg border border-gray-800 bg-gray-300 px-4 py-2 text-sm font-bold text-black">{editing ? "Enregistrer" : "+ Ajouter"}</button>
              {editing && <button onClick={() => { setEditing(null); setForm({ reference: "", label: "", stock: "0", specs: "" }); }} className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm text-black">Annuler</button>}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-300 bg-white">
            <div className="border-b border-gray-300 bg-gray-100 px-4 py-3 flex items-center justify-between">
              <span className="font-bold text-black">{selectedCategory.name} — {filteredMaterials.length} matière(s)</span>
              {/* Barre de recherche */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-48 px-3 py-1.5 pr-8 rounded-lg border border-gray-400 text-sm bg-white text-black"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-black">
                <thead><tr className="border-b border-gray-300 bg-gray-100 text-left"><th className="px-4 py-2">Référence</th><th className="px-4 py-2">Libellé</th><th className="px-4 py-2">Stock indicatif</th><th className="px-4 py-2">Spécifications</th><th className="px-4 py-2">Actions</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={5} className="py-10 text-center">Chargement...</td></tr> : filteredMaterials.length === 0 ? <tr><td colSpan={5} className="py-10 text-center">{searchQuery ? "Aucun résultat pour cette recherche." : "Aucune matière dans cette catégorie."}</td></tr> : filteredMaterials.map(material => (
                    <tr key={material.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-2 font-bold">{material.reference}</td><td className="px-4 py-2">{material.name}</td>
                      <td className="px-4 py-2"><input type="number" step="any" defaultValue={material.stock} onBlur={event => updateStock(material, event.target.value)} className="w-28 rounded border border-gray-400 bg-white px-2 py-1 text-black" title="Stock indicatif modifiable" /></td>
                      <td className="px-4 py-2">{material.specs || "-"}</td>
                      <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => startEdit(material)} className="mr-2 rounded border border-gray-500 bg-gray-200 px-2 py-1 text-xs text-black">Modifier</button><button onClick={() => archive(material.id)} className="rounded border border-red-700 bg-red-200 px-2 py-1 text-xs text-black">Retirer</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
