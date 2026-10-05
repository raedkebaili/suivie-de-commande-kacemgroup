"use client";

import React from "react";
import type { OrderItem, TechnicalComponent } from "@/lib/types";
import { useColors } from "@/lib/color-context";
import { ORDER_STATE_PANEL_CLASSES, OrderVisualState } from "@/lib/order-visual-state";

type OrderItemRowProps = {
  item: OrderItem & { technicalComponents?: TechnicalComponent[] };
  orderId: number;
  visualState: OrderVisualState;
  /** Map des modifications: articleName -> Set<fieldType> */
  modifications: Map<string, Set<string>> | undefined;
  highlight: (text: string) => React.ReactNode;
  fmtDate: (d: string) => string;
  onShowExpeditionHistory: (itemId: number) => void;
  /** true si l'article est EN COURS DE PRODUCTION d'après le planning (clignotement) */
  planningInProgress?: boolean;
};

/**
 * Composant pour afficher une ligne d'article dans le tableau de commande.
 * Applique la coloration des champs modifiés.
 */
function OrderItemRow({
  item,
  orderId,
  visualState,
  modifications,
  highlight,
  fmtDate,
  onShowExpeditionHistory,
  planningInProgress = false,
}: OrderItemRowProps) {
  const { getModifiedCellStyle, getColor } = useColors();
  // Alerte visuelle « en cours de production » (couleur administrable)
  const planningStyle = planningInProgress
    ? ({ ["--planning-color"]: getColor("PLANNING_EN_COURS"), ["--planning-text"]: "#000000" } as React.CSSProperties)
    : undefined;
  // Famille TÉLÉGESTION : surbrillance de la ligne avec la couleur définie
  // pour les spécifications techniques de télégestion (administrable).
  const isTelegestionItem = !!item.isTelegestion;
  const telegestionBg = isTelegestionItem ? getColor("TELEGESTION_ITEM") : undefined;
  
  // Déterminer l'état visuel de l'article
  const itemState: OrderVisualState = 
    visualState === "cancelled" ? "cancelled" :
    (item.deliveredQty || 0) >= item.quantity ? "delivered" :
    (item.producedQty || 0) >= item.quantity ? "awaiting-delivery" : "neutral";

  // Vérifier les champs modifiés pour cet article
  const articleMods = modifications?.get(item.articleName);
  const isArticleModified = articleMods?.has("articleName") || articleMods?.has("added");
  const isQtyModified = articleMods?.has("quantity");
  const isSpecModified = articleMods?.has("clientSpec");
  const isNoteModified = articleMods?.has("note");
  const isTechModified = articleMods?.has("technicalComponents");

  // Style pour les cellules modifiées
  const modStyle = getModifiedCellStyle();

  return (
    <tr className={`border-b border-black/20 text-black [&_td]:text-black [&_span]:text-black [&_b]:text-black ${ORDER_STATE_PANEL_CLASSES[itemState]}`}
      style={telegestionBg ? { backgroundColor: telegestionBg, boxShadow: `inset 3px 0 0 0 ${telegestionBg}` } : undefined}
      title={isTelegestionItem ? "Article de la famille Télégestion" : undefined}>
      {/* Article */}
      <td 
        className="px-1 py-1 font-medium text-[10px]" 
        style={isArticleModified ? modStyle : undefined}
        title={isArticleModified ? "Article modifié" : undefined}
      >
        {isArticleModified && <span className="mr-0.5">✏️</span>}
        {isTelegestionItem && <span className="mr-0.5" title="Famille Télégestion">📡</span>}
        {planningInProgress
          ? <span className="planning-blink inline-block px-1 font-bold" style={planningStyle} title="En cours de production (planning)">{highlight(item.articleName)}</span>
          : highlight(item.articleName)}
      </td>
      
      {/* Quantité commandée */}
      <td 
        className="px-1 py-1 font-bold text-[10px]" 
        style={isQtyModified ? modStyle : undefined}
        title={isQtyModified ? "Quantité modifiée" : undefined}
      >
        {item.quantity}
      </td>
      
      {/* Unité de production */}
      <td className="px-1 py-1 text-[9px]">{item.productionUnit || '-'}</td>
      
      {/* Produit */}
      <td className="px-1 py-1 text-[10px] font-normal">{item.producedQty || 0}</td>
      
      {/* Livré */}
      <td className="px-1 py-1 text-[10px] font-normal">{item.deliveredQty || 0}</td>
      
      {/* Stock (Produit - Livré) */}
      <td className="px-1 py-1 font-normal text-[10px]">
        {Math.max(0, (item.producedQty || 0) - (item.deliveredQty || 0))}
      </td>
      
      {/* Reste à livrer */}
      <td className="px-1 py-1 text-[10px]">
        <span className="remaining-to-deliver">
          {Math.max(0, item.quantity - (item.deliveredQty || 0))}
        </span>
      </td>
      
      {/* Besoin client */}
      <td 
        className="px-1 py-1 text-[9px] max-w-[100px] truncate"
        style={isSpecModified ? modStyle : undefined}
        title={isSpecModified ? `Besoin modifié: ${item.clientSpec}` : item.clientSpec || ""}
      >
        {item.clientSpec || "-"}
      </td>
      
      {/* Spécifications techniques */}
      <td 
        className="px-1 py-1 text-[9px] min-w-[260px]"
        style={isTechModified ? { borderLeft: `4px solid ${modStyle.backgroundColor}` } : undefined}
      >
        {item.technicalComponents && item.technicalComponents.length > 0 ? (
          <div className="grid gap-1">
            {isTechModified && (
              <div 
                className="text-[8px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 w-fit mb-1"
                style={modStyle}
              >
                ✏️ Composants modifiés
              </div>
            )}
            {item.technicalComponents.map(component => (
              <div 
                key={component.id}
                className={`rounded border px-2 py-1 text-black ${
                  component.isTelegestion ? "bg-sky-100 border-sky-500" : "bg-white/70 border-black/20"
                }`}
                title={`Saisi par ${component.enteredByName} le ${fmtDate(component.enteredAt)}`}
              >
                <div className="font-bold">
                  {component.isTelegestion ? "📡 " : ""}
                  {component.categoryName}
                </div>
                <div>
                  <b>{component.materialReference}</b> — {component.materialLabel}
                </div>
                <div className="text-[8px]">
                  Responsable : {component.enteredByName} • {fmtDate(component.enteredAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="font-semibold">Spécifications techniques en attente</span>
        )}
      </td>
      
      {/* Note */}
      <td 
        className="px-1 py-1 text-[9px] max-w-[80px] truncate"
        style={isNoteModified ? modStyle : undefined}
        title={isNoteModified ? `Note modifiée: ${item.note}` : item.note || ""}
      >
        {item.note || "-"}
      </td>
      
      {/* Expédition */}
      <td className="px-1 py-1 text-[9px]">
        {item.deliveryDate && <span>{item.deliveryDate}</span>}
        {item.deliveredQty && item.deliveredQty > 0 ? (
          <span className="font-medium ml-1">{item.deliveredQty}</span>
        ) : null}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (item.id) onShowExpeditionHistory(item.id);
          }}
          className="ml-1 text-[8px] text-black underline block"
        >
          Historique
        </button>
      </td>
    </tr>
  );
}

export default React.memo(OrderItemRow);
