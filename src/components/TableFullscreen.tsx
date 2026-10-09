"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface TableFullscreenProps {
  /** Nom accessible du tableau affiché en plein écran. */
  title: string;
  /** Appelé quand l'utilisateur quitte le plein écran (Échap, bouton, sortie navigateur). */
  onExit: () => void;
  children: ReactNode;
}

/**
 * Affiche UNIQUEMENT le tableau fourni, sur tout l'écran.
 *
 * - Rendu via un portail sur <body> : aucun élément de la page (barre latérale,
 *   en-tête, filtres) ne reste visible au-dessus ou autour du tableau.
 * - Demande le plein écran natif du navigateur lorsque c'est autorisé, pour
 *   masquer aussi la barre d'adresse ; si le navigateur refuse (iframe sans
 *   autorisation, etc.), le conteneur couvre quand même l'écran entier.
 * - Échap ou le bouton ✕ quittent ; si l'utilisateur quitte le plein écran
 *   natif (Échap du navigateur, F11), la vue revient aussi à l'état normal.
 */
export default function TableFullscreen({ title, onExit, children }: TableFullscreenProps) {
  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  useEffect(() => {
    const doc = document;
    let enteredNative = false;

    const onNativeChange = () => {
      if (doc.fullscreenElement) enteredNative = true;
      else if (enteredNative) onExitRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onExitRef.current();
    };

    doc.addEventListener("fullscreenchange", onNativeChange);
    window.addEventListener("keydown", onKeyDown);

    // Peut être refusé (iframe sans allow="fullscreen", absence de geste) : on ignore l'erreur.
    if (!doc.fullscreenElement) {
      doc.documentElement.requestFullscreen?.().catch(() => { /* plein écran natif indisponible */ });
    }

    return () => {
      doc.removeEventListener("fullscreenchange", onNativeChange);
      window.removeEventListener("keydown", onKeyDown);
      if (doc.fullscreenElement) doc.exitFullscreen?.().catch(() => { /* déjà quitté */ });
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="table-fullscreen fixed inset-0 z-40 flex flex-col bg-gray-50 dark:bg-gray-950"
    >
      <button
        type="button"
        onClick={() => onExitRef.current()}
        title="Quitter le plein écran (Échap)"
        aria-label="Quitter le plein écran"
        className="absolute right-2 top-2 z-50 flex h-7 w-7 items-center justify-center rounded-full bg-gray-800/60 text-sm font-bold text-white opacity-60 shadow hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        ✕
      </button>
      <div className="flex-1 min-h-0 overflow-auto p-2 sm:p-3">{children}</div>
    </div>,
    document.body,
  );
}
