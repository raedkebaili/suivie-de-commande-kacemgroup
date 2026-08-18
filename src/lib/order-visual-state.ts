export type OrderVisualState = "neutral" | "awaiting-delivery" | "delivered" | "cancelled";

type VisualStateInput = {
  productionStatus?: string | null;
  ordered: number;
  produced: number;
  delivered: number;
};

export function getOrderVisualState({
  productionStatus,
  ordered,
  produced,
  delivered,
}: VisualStateInput): OrderVisualState {
  if (productionStatus === "ANNULEE") return "cancelled";
  if (productionStatus === "LIVREE" || (ordered > 0 && delivered >= ordered)) return "delivered";
  if (ordered > 0 && produced >= ordered) return "awaiting-delivery";
  return "neutral";
}

export const ORDER_STATE_ROW_CLASSES: Record<OrderVisualState, string> = {
  neutral: "bg-white hover:bg-gray-100 border-gray-300",
  "awaiting-delivery": "bg-[#FFF700] hover:bg-[#E6DE00] border-[#B8A900]",
  delivered: "bg-green-300 hover:bg-green-400 border-green-700",
  cancelled: "bg-[#FF2C2C] hover:bg-[#E62626] border-[#B81F1F]",
};

export const ORDER_STATE_PANEL_CLASSES: Record<OrderVisualState, string> = {
  neutral: "bg-white border-gray-300",
  "awaiting-delivery": "bg-[#FFF700] border-[#B8A900]",
  delivered: "bg-green-300 border-green-700",
  cancelled: "bg-[#FF2C2C] border-[#B81F1F]",
};

export const ORDER_STATE_LABELS: Record<OrderVisualState, string> = {
  neutral: "En cours",
  "awaiting-delivery": "En attente de livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};
