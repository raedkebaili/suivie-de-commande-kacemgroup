// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Sidebar from "../Sidebar";
import type { User } from "@/lib/types";
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);
it("borne le menu à la hauteur disponible, avec navigation défilante et pied non rétractable", () => {
  render(<Sidebar user={{ id: 1, role: "superadmin", fullName: "Admin" } as User} activeTab="orders" tabs={Array.from({ length: 30 }, (_, i) => ({ key: `tab-${i}`, label: `Onglet ${i}`, roles: ["superadmin"] }))} collapsed={false} onToggle={() => {}} onTabChange={() => {}} darkMode={false} onToggleDarkMode={() => {}} />);
  const sidebar = screen.getByRole("complementary"), nav = screen.getByRole("navigation");
  for (const name of ["h-full", "min-h-0", "overflow-hidden", "shrink-0"]) expect(sidebar.classList.contains(name)).toBe(true);
  for (const name of ["min-h-0", "overflow-y-auto", "overscroll-contain"]) expect(nav.classList.contains(name)).toBe(true);
  const footer = screen.getByTitle("Déconnexion").parentElement!;
  expect(footer.classList.contains("shrink-0")).toBe(true);
});
