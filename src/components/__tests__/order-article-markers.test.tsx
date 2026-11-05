// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import OrderArticleMarkers from "../OrderArticleMarkers";
import { orderArticleProgress } from "@/lib/order-article-progress";
afterEach(cleanup);
it("marque séparément la disponibilité et les livraisons partielles sur toute la commande", () => {
  render(<OrderArticleMarkers items={[
    { quantity: 100, producedQty: 100, deliveredQty: 20 },
    { quantity: 100, producedQty: 0, deliveredQty: 0 },
  ]} />);
  expect(screen.getByLabelText("1/2 articles prêts à livrer — commande partiellement prête")).toBeTruthy();
  expect(screen.getByLabelText("1/2 articles avec une quantité livrée — commande partiellement livrée")).toBeTruthy();
});
it("ne confond pas un surplus sur un article avec la disponibilité des autres", () => {
  expect(orderArticleProgress([{ quantity: 10, producedQty: 20 }, { quantity: 10, producedQty: 0 }])).toEqual({ total: 2, ready: 1, delivered: 0, fullyDelivered: false });
});
it("distingue une livraison totale d’une quantité partielle sur chaque article", () => {
  const { rerender } = render(<OrderArticleMarkers items={[{ quantity: 100, producedQty: 100, deliveredQty: 20 }]} />);
  expect(screen.getByLabelText(/commande partiellement livrée/)).toBeTruthy();
  rerender(<OrderArticleMarkers items={[{ quantity: 100, producedQty: 100, deliveredQty: 100 }]} />);
  expect(screen.getByLabelText(/commande totalement livrée/)).toBeTruthy();
  expect(screen.queryByLabelText(/articles prêts/)).toBeNull();
});
it("ignore les quantités nulles et les commandes annulées", () => {
  const { container, rerender } = render(<OrderArticleMarkers items={[{ quantity: 0, producedQty: 100 }]} />);
  expect(container.textContent).toBe("");
  rerender(<OrderArticleMarkers cancelled items={[{ quantity: 10, producedQty: 10 }]} />);
  expect(container.textContent).toBe("");
});
it("respecte la disponibilité canonique du serveur, notamment les annulations de planning", () => {
  const { container } = render(<OrderArticleMarkers items={[{ quantity: 100, producedQty: 100, workflowReady: false }]} />);
  expect(container.textContent).toBe("");
});
