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
  categoryName: string | null;
  isTelegestion: boolean | null;
};

type Props = {
  value: string;
  onChange: (value: string, material?: Material) => void;
  onSelect?: (material: Material) => void;
  categoryId?: number | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showStock?: boolean;
  showCategory?: boolean;
};

export default function MaterialAutocomplete({
  value,
  onChange,
  onSelect,
  categoryId,
  placeholder = "Rechercher une matière...",
  disabled = false,
  className = "",
  showStock = false,
  showCategory = true,
}: Props) {
  const [suggestions, setSuggestions] = useState<Material[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Recherche avec debounce
  const searchMaterials = useCallback(async (query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (categoryId) params.set("categoryId", String(categoryId));
        params.set("limit", "15");

        const data = await apiFetch<{ results: Material[] }>(`/api/matieres/search?${params}`);
        setSuggestions(data.results);
        setHighlightedIndex(-1);
      } catch (error) {
        console.error("Erreur recherche matières:", error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 200); // 200ms debounce
  }, [categoryId]);

  // Charger les suggestions initiales quand on focus
  const handleFocus = () => {
    setIsOpen(true);
    if (suggestions.length === 0) {
      searchMaterials(value);
    }
  };

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Gérer la saisie
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    searchMaterials(newValue);
    setIsOpen(true);
  };

  // Sélectionner une matière
  const handleSelect = (material: Material) => {
    const displayValue = `${material.reference} - ${material.name}`;
    onChange(displayValue, material);
    onSelect?.(material);
    setIsOpen(false);
    setSuggestions([]);
  };

  // Navigation clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

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

  // Mettre en surbrillance le texte recherché
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
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
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-3 py-2 pr-8 border rounded-lg text-sm bg-white text-black border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${className}`}
        />
        {/* Icône de recherche / loading */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {loading ? (
            <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
      </div>

      {/* Dropdown des suggestions */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {suggestions.map((material, index) => (
            <div
              key={material.id}
              onClick={() => handleSelect(material)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-3 py-2 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                index === highlightedIndex 
                  ? "bg-blue-50" 
                  : "hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {/* Référence et Nom */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-black">
                      {highlightMatch(material.reference, value)}
                    </span>
                    <span className="text-gray-600">—</span>
                    <span className="text-sm text-black truncate">
                      {highlightMatch(material.name, value)}
                    </span>
                  </div>
                  {/* Catégorie et Specs */}
                  <div className="flex items-center gap-2 mt-0.5">
                    {showCategory && material.categoryName && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        material.isTelegestion 
                          ? "bg-sky-100 text-sky-700" 
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {material.isTelegestion ? "📡 " : ""}{material.categoryName}
                      </span>
                    )}
                    {material.specs && (
                      <span className="text-xs text-gray-500 truncate">
                        {material.specs}
                      </span>
                    )}
                  </div>
                </div>
                {/* Stock */}
                {showStock && (
                  <div className="ml-2 text-right shrink-0">
                    <span className={`text-xs font-medium ${
                      material.stock > 0 ? "text-green-600" : "text-gray-400"
                    }`}>
                      {material.stock > 0 ? `Stock: ${material.stock}` : "Rupture"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Message si aucun résultat */}
      {isOpen && !loading && suggestions.length === 0 && value.length >= 1 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3">
          <div className="text-sm text-gray-500 text-center">
            Aucune matière trouvée pour "{value}"
          </div>
        </div>
      )}
    </div>
  );
}
