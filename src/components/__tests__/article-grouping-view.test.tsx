// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ArticleGroupingView from "../ArticleGroupingView";
import { apiFetch } from "@/lib/api";
import { groupArticles } from "@/lib/article-grouping";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(cleanup);
it("affiche la famille du catalogue dans la colonne Famille, et pas l’origine automatique", async () => {
  const groups = groupArticles([{ articleName: "Luminaire NETLUX LED 75W IP66", quantity: 5 }], undefined, [{ category: "LUMINAIRE D'ECLAIRAGE PUBLIQUE", subFamily: "NETLUX", variant: "" }]);
  vi.mocked(apiFetch).mockResolvedValue({ groups, totals: null });
  render(<ArticleGroupingView filters={{ status: "", agency: "", priority: "" }} refreshKey={1} />);
  const family = await screen.findByRole("cell", { name: "LUMINAIRE D'ECLAIRAGE PUBLIQUE" });
  expect(within(family).queryByText("Auto")).toBeNull();
  expect(await screen.findByRole("cell", { name: "75 W" })).toBeTruthy();
});
