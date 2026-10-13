import type { ReactNode } from "react";

/**
 * Cause d'annulation saisie dans le planning de production.
 * Affichée en alternance LENTE avec le contenu normal de la cellule d'état
 * (la couleur de la ligne reste visible). Animation CSS « planning-cause-*»,
 * désactivée automatiquement si l'utilisateur préfère moins d'animations.
 */
export default function PlanningCancelCause({ causes, normal }: { causes: string[]; normal: ReactNode }) {
  const text = causes.join(" · ");
  return (
    <span className="planning-cause-grid" title={`Annulé dans le planning : ${text}`}>
      <span className="planning-cause-normal">{normal}</span>
      <span className="planning-cause-msg text-[9px] font-bold px-1.5 py-0.5 rounded border border-black/40 bg-white text-black">
        ⛔ {text}
      </span>
    </span>
  );
}
