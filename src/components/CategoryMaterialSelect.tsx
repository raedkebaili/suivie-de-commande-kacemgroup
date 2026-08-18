"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";

type Material = {
  id: number;
  categoryId: number | null;
  category: string;
  reference: string;
  name: string;
  stock: number;
  specs: string | null;
  categoryName?: string | null;
};

type Props = {
  categoryId: number;
  categoryName: string;
  selectedMaterialId: number | null;
  onSelect: (materialId: number | null) => void;
  disabled?: boolean;
};

/**
 * Composant de sélection de matière avec recherche intelligente
 * Remplace les <select> simples par un autocomplete performant
 */
export default function CategoryMaterialSelect({
  categoryId,
  categoryName,
  selectedMaterialId,
  onSelect,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Material[]>([]);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Charger les matières de cette catégorie au montage
  useEffect(() => {
    const loadMaterials = async () => {
      try {
        const data = await apiFetch<{ results: Material[] }>(
          `/api/matieres/search?categoryId=${categoryId}&limit=50`
        );
        setAllMaterials(data.results);
        
        // Si une matière est déjà sélectionnée, la trouver
        if (selectedMaterialId) {
          const selected = data.results.find(m => m.id === selectedMaterialId);
          if (selected) {
            setSelectedMaterial(selected);
            setQuery(`${selected.reference} — ${selected.name}`);
          }
        }
      } catch (error) {
        console.error("Erreur chargement matières:", error);
      }
    };
    loadMaterials();
  }, [categoryId, selectedMaterialId]);

  // Recherche avec debounce
  const searchMaterials = useCallback(async (searchQuery: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      if (!searchQuery.trim()) {
        // Si pas de recherche, afficher toutes les matières de la catégorie
        setSuggestions(allMaterials.slice(0, 15));
        return;
      }

      setLoading(true);
      try {
        const data = await apiFetch<{ results: Material[] }>(
          `/api/matieres/search?categoryId=${categoryId}&q=${encodeURIComponent(searchQuery)}&limit=15`
        );
        setSuggestions(data.results);
        setHighlightedIndex(-1);
      } catch (error) {
        console.error("Erreur recherche:", error);
        // Filtrage local en cas d'erreur
        const filtered = allMaterials.filter(m =>
          m.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.name.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 15);
        setSuggestions(filtered);
      } finally {
        setLoading(false);
      }
    }, 150);
  }, [categoryId, allMaterials]);

  // Gérer l'ouverture du dropdown
  const handleFocus = () => {
    setIsOpen(true);
    if (suggestions.length === 0) {
      setSuggestions(allMaterials.slice(0, 15));
    }
  };

  // Gérer la saisie
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsOpen(true);
    
    // Si l'utilisateur efface la saisie, désélectionner
    if (!value.trim()) {
      setSelectedMaterial(null);
      onSelect(null);
    }
    
    searchMaterials(value);
  };

  // Sélectionner une matière
  const handleSelect = (material: Material) => {
    setSelectedMaterial(material);
    setQuery(`${material.reference} — ${material.name}`);
    onSelect(material.id);
    setIsOpen(false);
    setSuggestions([]);
  };

  // Effacer la sélection
  const handleClear = () => {
    setQuery("");
    setSelectedMaterial(null);
    onSelect(null);
    inputRef.current?.focus();
    setSuggestions(allMaterials.slice(0, 15));
    setIsOpen(true);
  };

  // Navigation clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        setSuggestions(allMaterials.slice(0, 15));
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelect(suggestions[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  // Fermer le dropdown au clic externe
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Highlight le texte recherché
  const highlightMatch = (text: string) => {
    if (!query || query.includes("—")) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi"));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-yellow-200 text-black px-0.5 rounded">{part}</mark>
          ) : part
        )}
      </>
    );
  };

  return (
    <div ref={containerRef} className="block rounded-lg border border-gray-300 bg-gray-50 p-2">
      <span className="block text-xs font-bold text-black mb-1">{categoryName}</span>
      
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="🔍 Rechercher..."
          disabled={disabled}
          className="w-full rounded-lg border border-gray-400 bg-white px-2 py-2 pr-8 text-xs text-black placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
        />
        
        {/* Bouton effacer */}
        {selectedMaterial && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Effacer la sélection"
          >
            ✕
          </button>
        )}
        
        {/* Indicateur de chargement */}
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      {/* Dropdown des suggestions */}
      {isOpen && suggestions.length > 0 && (
        <div className="mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((material, index) => (
            <div
              key={material.id}
              onClick={() => handleSelect(material)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-2 py-1.5 cursor-pointer text-xs border-b border-gray-100 last:border-b-0 transition-colors ${
                index === highlightedIndex 
                  ? "bg-blue-50" 
                  : selectedMaterial?.id === material.id
                    ? "bg-green-50"
                    : "hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <span className="font-mono font-bold text-black">
                    {highlightMatch(material.reference)}
                  </span>
                  <span className="text-gray-500 mx-1">—</span>
                  <span className="text-black">
                    {highlightMatch(material.name)}
                  </span>
                </div>
                <span className={`ml-2 text-[10px] shrink-0 ${
                  material.stock > 0 ? "text-green-600" : "text-gray-400"
                }`}>
                  {material.stock > 0 ? `Stock: ${material.stock}` : "Épuisé"}
                </span>
              </div>
              {material.specs && (
                <div className="text-[10px] text-gray-500 truncate mt-0.5">
                  {material.specs}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Message si aucun résultat */}
      {isOpen && !loading && suggestions.length === 0 && query.length > 0 && !query.includes("—") && (
        <div className="mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-2">
          <div className="text-xs text-gray-500 text-center">
            Aucune matière trouvée pour "{query}"
          </div>
        </div>
      )}

      {/* Indication de la sélection */}
      {selectedMaterial && (
        <div className="mt-1 text-[10px] text-green-600 flex items-center gap-1">
          <span>✓</span>
          <span>Sélectionné: {selectedMaterial.reference}</span>
        </div>
      )}
    </div>
  );
}
