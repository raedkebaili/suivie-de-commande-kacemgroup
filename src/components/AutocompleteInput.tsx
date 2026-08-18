"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  category?: string; // pour tech: pcb, lens, driver...
  suggestUrl?: string; // URL API personnalisée pour suggestions
  disabled?: boolean;
  inputClassName?: string; // classes appliquées à l'input lui-même
  minChars?: number; // nombre minimum de caractères avant recherche
  debounceMs?: number; // délai de debounce en ms
};

type SuggestionItem = {
  value: string;
  label?: string;
  category?: string;
};

export default function AutocompleteInput({ 
  value, 
  onChange, 
  placeholder, 
  category, 
  suggestUrl, 
  disabled, 
  inputClassName,
  minChars = 0,
  debounceMs = 150
}: Props) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [show, setShow] = useState(false);
  const [allValues, setAllValues] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Charger les valeurs initiales
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        if (suggestUrl) {
          const d = await apiFetch<{ 
            affaires?: { affaire: string }[]; 
            articles?: { name: string; description?: string }[];
            units?: { name: string }[];
          }>(suggestUrl);
          
          if (d.affaires) {
            setAllValues(d.affaires.map((a) => ({ value: a.affaire, label: a.affaire })));
          } else if (d.articles) {
            setAllValues(d.articles.map((a) => ({ value: a.name, label: a.name, category: a.description })));
          } else if (d.units) {
            setAllValues(d.units.map((u) => ({ value: u.name, label: u.name })));
          }
        } else if (category) {
          const d = await apiFetch<{ techs: { value: string; category: string }[] }>(`/api/library/tech?category=${category}`);
          setAllValues(d.techs.map(t => ({ value: t.value, label: t.value, category: t.category })));
        }
      } catch {
        // Erreur silencieuse
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [category, suggestUrl]);

  // Filtrer les suggestions avec debounce
  const filterSuggestions = useCallback((searchValue: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (searchValue.length >= minChars && allValues.length > 0) {
        const filtered = allValues.filter(item => 
          item.value.toLowerCase().includes(searchValue.toLowerCase()) ||
          (item.label && item.label.toLowerCase().includes(searchValue.toLowerCase())) ||
          (item.category && item.category.toLowerCase().includes(searchValue.toLowerCase()))
        ).slice(0, 10);
        setSuggestions(filtered);
        setShow(true);
        setHighlightedIndex(-1);
      } else if (searchValue.length === 0) {
        setSuggestions(allValues.slice(0, 8));
        setShow(true);
      } else {
        setShow(false);
      }
    }, debounceMs);
  }, [allValues, minChars, debounceMs]);

  const handleChange = (v: string) => {
    onChange(v);
    filterSuggestions(v);
  };

  const handleFocus = () => {
    if (allValues.length > 0) {
      if (value.length >= minChars) {
        filterSuggestions(value);
      } else {
        setSuggestions(allValues.slice(0, 8));
        setShow(true);
      }
    }
  };

  const handleSelect = (item: SuggestionItem) => {
    onChange(item.value);
    setShow(false);
    setSuggestions([]);
  };

  // Navigation clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!show || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelect(suggestions[highlightedIndex]);
        }
        break;
      case "Escape":
        setShow(false);
        break;
    }
  };

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Highlight le texte recherché
  const highlightMatch = (text: string, query: string) => {
    if (!query || query.length < 1) return text;
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
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-2 py-1.5 pr-7 border rounded text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${inputClassName || ""}`}
        />
        {/* Indicateur de chargement ou icône */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {loading ? (
            <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>

      {show && suggestions.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((item, i) => (
            <div 
              key={i} 
              className={`px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                i === highlightedIndex 
                  ? "bg-blue-50 dark:bg-blue-900/30" 
                  : "hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseDown={() => handleSelect(item)}
            >
              <div className="text-gray-800 dark:text-gray-200">
                {highlightMatch(item.value, value)}
              </div>
              {item.category && item.category !== item.value && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {item.category}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {show && suggestions.length === 0 && value.length >= minChars && !loading && (
        <div className="absolute z-30 top-full left-0 right-0 mt-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-2">
          <div className="text-xs text-gray-500 text-center">
            Aucune suggestion pour "{value}"
          </div>
        </div>
      )}
    </div>
  );
}
