"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ClientRecouvrementAssignment } from "@/lib/types";
import { useColors } from "@/lib/color-context";
import { getContrastTextColor } from "@/lib/color-utils";

/**
 * Alerte visuelle de recouvrement.
 * Affiche en ALTERNANCE le nom du client et son état de recouvrement,
 * avec la couleur de l'état (administrable via l'onglet Couleurs).
 *
 * Utilisé dans le tableau des clients ET dans le tableau des commandes.
 * Si aucun état n'est affecté, le nom est rendu tel quel (aucun changement visuel).
 */
export default function RecouvrementAlertCell({
  name,
  assignment,
  onClick,
  title,
}: {
  /** Contenu normal de la cellule (nom du client, éventuellement surligné par la recherche) */
  name: ReactNode;
  /** Affectation de recouvrement du client, ou undefined si aucune */
  assignment?: ClientRecouvrementAssignment;
  onClick?: () => void;
  title?: string;
}) {
  const { getColor } = useColors();

  if (!assignment) {
    return <span onClick={onClick} className={onClick ? "cursor-pointer" : undefined} title={title}>{name}</span>;
  }

  const hex = getColor(assignment.colorKey);
  const style = {
    "--recouv-color": hex,
    "--recouv-text": getContrastTextColor(hex),
  } as CSSProperties;

  const tooltip =
    title ??
    `${assignment.label}${assignment.note ? ` — ${assignment.note}` : ""}${assignment.updatedByName ? ` (par ${assignment.updatedByName})` : ""}`;

  return (
    <span
      className={`recouv-swap ${onClick ? "cursor-pointer" : ""}`}
      style={style}
      title={tooltip}
      onClick={onClick}
    >
      <span className="recouv-swap-item recouv-swap-name">{name}</span>
      <span className="recouv-swap-item recouv-swap-state" aria-hidden="true">{assignment.label}</span>
    </span>
  );
}
