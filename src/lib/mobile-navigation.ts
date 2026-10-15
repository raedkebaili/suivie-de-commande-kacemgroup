import type { Role } from "./types";

export type MobileSection = "account" | "notifications" | "clients" | "agencies" | "productionPlanning" | "expeditionPlanning" | "newOrder";

/** Même visibilité que les modules de la navigation ordinateur. L'API reste l'autorité. */
export function canOpenMobileSection(role: Role, section: MobileSection): boolean {
  if (section === "newOrder") return ["superadmin", "commercial", "planification"].includes(role);
  if (section === "productionPlanning") return ["superadmin", "planification", "consultant_prod", "gerant"].includes(role);
  if (section === "expeditionPlanning") return ["superadmin", "planification", "gerant"].includes(role);
  if (section === "clients") return ["superadmin", "commercial", "recouvrement"].includes(role);
  if (section === "agencies") return ["superadmin", "commercial"].includes(role);
  return true;
}

export function filterMobileDirectory<T extends { name: string; code: string; contactName?: string | null; phone?: string | null; email?: string | null }>(rows: T[], query: string): T[] {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  const term = normalize(query.trim());
  return rows.filter((row) => normalize([row.name, row.code, row.contactName, row.phone, row.email].filter(Boolean).join(" ")).includes(term));
}
