"use client";

import React from "react";
import { useColors } from "@/lib/color-context";

type ModifiedCellProps = {
  /** Le contenu de la cellule */
  children: React.ReactNode;
  /** Si true, la cellule est marquée comme modifiée */
  isModified: boolean;
  /** Classes CSS additionnelles */
  className?: string;
  /** Tooltip optionnel */
  title?: string;
  /** Tag HTML à utiliser (par défaut: td) */
  as?: "td" | "span" | "div";
};

/**
 * Composant pour afficher une cellule avec indication visuelle si elle a été modifiée.
 * Utilise le système de couleurs configurable.
 */
export default function ModifiedCell({
  children,
  isModified,
  className = "",
  title,
  as: Tag = "td",
}: ModifiedCellProps) {
  const { getModifiedCellStyle } = useColors();

  if (!isModified) {
    return (
      <Tag className={className} title={title}>
        {children}
      </Tag>
    );
  }

  const modifiedStyle = getModifiedCellStyle();

  return (
    <Tag
      className={`${className} relative`}
      style={modifiedStyle}
      title={title ? `${title} (modifié)` : "Ce champ a été modifié"}
    >
      {children}
      {/* Indicateur visuel discret */}
      <span 
        className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: modifiedStyle.backgroundColor, filter: "brightness(0.7)" }}
        aria-hidden="true"
      />
    </Tag>
  );
}

/**
 * Composant span pour les cellules en ligne
 */
export function ModifiedSpan({
  children,
  isModified,
  className = "",
  title,
}: Omit<ModifiedCellProps, "as">) {
  const { getModifiedCellStyle } = useColors();

  if (!isModified) {
    return (
      <span className={className} title={title}>
        {children}
      </span>
    );
  }

  const modifiedStyle = getModifiedCellStyle();

  return (
    <span
      className={`${className} px-1 rounded`}
      style={modifiedStyle}
      title={title ? `${title} (modifié)` : "Ce champ a été modifié"}
    >
      {children}
    </span>
  );
}

/**
 * Composant pour marquer un composant technique comme modifié
 */
export function ModifiedTechComponent({
  children,
  isModified,
  className = "",
}: {
  children: React.ReactNode;
  isModified: boolean;
  className?: string;
}) {
  const { getModifiedCellStyle } = useColors();

  if (!isModified) {
    return <div className={className}>{children}</div>;
  }

  const modifiedStyle = getModifiedCellStyle();

  return (
    <div
      className={`${className} ring-2 ring-offset-1`}
      style={{ 
        ...modifiedStyle,
        // @ts-expect-error - CSS custom property
        "--tw-ring-color": modifiedStyle.backgroundColor,
      }}
      title="Composant technique modifié"
    >
      {children}
    </div>
  );
}
