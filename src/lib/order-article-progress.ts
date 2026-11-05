export type ProgressItem = { workflowReady?: boolean; quantity?: number; producedQty?: number | null; deliveredQty?: number | null };
/** Compte les articles, jamais un solde global pouvant masquer un article incomplet. */
export function orderArticleProgress(items: ProgressItem[]) {
  const positive = items.filter(item => (item.quantity || 0) > 0);
  return {
    total: positive.length,
    ready: positive.filter(item => item.workflowReady ?? ((item.producedQty || 0) >= item.quantity! && (item.deliveredQty || 0) < item.quantity!)).length,
    delivered: positive.filter(item => (item.deliveredQty || 0) > 0).length,
    fullyDelivered: positive.length > 0 && positive.every(item => (item.deliveredQty || 0) >= item.quantity!),
  };
}
