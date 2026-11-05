import { orderArticleProgress, type ProgressItem } from "@/lib/order-article-progress";

/** Repères discrets sur la commande complète, indépendants des articles filtrés. */
export default function OrderArticleMarkers({ items, cancelled = false }: { items: ProgressItem[]; cancelled?: boolean }) {
  if (cancelled) return null;
  const progress = orderArticleProgress(items);
  const readyLabel = `${progress.ready}/${progress.total} articles prêts à livrer — commande ${progress.ready === progress.total ? "entièrement" : "partiellement"} prête`;
  const deliveredLabel = `${progress.delivered}/${progress.total} articles avec une quantité livrée — commande ${progress.fullyDelivered ? "totalement" : "partiellement"} livrée`;
  return <span className="ml-1 inline-flex items-center gap-1 align-middle text-[10px] font-semibold">
    {progress.ready > 0 && <span title={readyLabel} aria-label={readyLabel} className="inline-flex items-center gap-0.5 rounded border border-blue-400 bg-blue-50 px-1 text-blue-900"><span aria-hidden="true">● P</span> {progress.ready}/{progress.total}</span>}
    {progress.delivered > 0 && <span title={deliveredLabel} aria-label={deliveredLabel} className="inline-flex items-center gap-0.5 rounded border border-green-500 bg-green-50 px-1 text-green-900"><span aria-hidden="true">✓ L</span> {progress.delivered}/{progress.total}</span>}
  </span>;
}
