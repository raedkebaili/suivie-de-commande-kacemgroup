"use client";

import { useEffect } from "react";
import { shortcutsForTabs, type ShortcutGroup } from "@/lib/keyboard-shortcuts";

const GROUPS: ShortcutGroup[] = ["Créer", "Naviguer", "Affichage", "Aide"];

interface KeyboardShortcutsHelpProps {
  /** Onglets réellement accessibles à l'utilisateur : seuls ces raccourcis sont listés. */
  allowedTabs: string[];
  onClose: () => void;
}

/** Aide listant les raccourcis disponibles pour le rôle courant (ouverte avec F1). */
export default function KeyboardShortcutsHelp({ allowedTabs, onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    // Capture + stopImmediatePropagation : Échap ferme l'aide sans fermer aussi le plein écran.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const defs = shortcutsForTabs(allowedTabs);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Raccourcis clavier">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 text-gray-800 shadow-2xl dark:bg-gray-900 dark:text-gray-100">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold">Raccourcis clavier</h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Alt + touche. Les raccourcis Alt ne sont pas actifs si votre navigateur les utilise déjà.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer (Échap)"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">✕</button>
        </div>
        {GROUPS.map((group) => {
          const items = defs.filter((def) => def.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group} className="mb-4">
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{group}</h5>
              <ul className="space-y-1.5">
                {items.map((def) => (
                  <li key={def.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{def.description}</span>
                    <kbd className="shrink-0 rounded-md border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">{def.label}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <p className="mt-2 text-[11px] text-gray-400">F1 ouvre ou ferme cette aide à tout moment.</p>
      </div>
    </div>
  );
}
