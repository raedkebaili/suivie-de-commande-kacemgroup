"use client";

import type { CSSProperties, ReactNode } from "react";

type Props = {
  id: string;
  articleName: string;
  clientSpec?: string | null;
  note?: string | null;
  specModified?: boolean;
  noteModified?: boolean;
  modifiedStyle?: CSSProperties;
  highlight?: (text: string) => ReactNode;
};

/** Texte intégral : ni troncature, ni hauteur limitée, ni dépendance au survol. */
export default function CommercialInstructions({ id, articleName, clientSpec, note, specModified, noteModified, modifiedStyle, highlight = text => text }: Props) {
  const fields = [
    { key: "need", label: "Besoin client", text: clientSpec, modified: specModified },
    { key: "note", label: "Note commerciale", text: note, modified: noteModified },
  ].filter(field => Boolean(field.text?.trim()));
  if (!fields.length) return null;
  return <div className={`commercial-instructions grid min-w-0 gap-2 ${fields.length === 2 ? "lg:grid-cols-2" : "grid-cols-1"}`}>
    {fields.map(field => <section
      key={field.key}
      id={`${id}-${field.key}`}
      aria-labelledby={`${id}-${field.key}-label`}
      className="min-w-0 scroll-mt-24 rounded-lg border border-amber-400 bg-amber-50 p-3 text-left text-black"
      style={field.modified ? modifiedStyle : undefined}
    >
      <h4 id={`${id}-${field.key}-label`} className="mb-1 text-xs font-bold">
        {field.key === "need" ? "📋" : "📝"} {field.label}
        {field.modified && <span className="ml-2">✏️ Modifié</span>}
        <span className="sr-only"> — {articleName}</span>
      </h4>
      <p className="m-0 whitespace-pre-wrap text-[13px] font-medium leading-relaxed" style={{ overflowWrap: "anywhere" }}>{highlight(field.text!)}</p>
    </section>)}
  </div>;
}
