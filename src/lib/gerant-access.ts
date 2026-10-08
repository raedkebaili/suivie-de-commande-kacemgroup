export const GERANT_ROLE = "gerant" as const;

/** Onglets accessibles au Gérant, exclusivement en consultation. */
export const GERANT_ALLOWED_TABS = [
  "orders",
  "archive",
  "planning",
  "expedition",
  "expeditionPlanning",
  "watchdog",
  "storage",
  "telegestion",
] as const;

export function isGerantAllowedTab(tab: string): boolean {
  return (GERANT_ALLOWED_TABS as readonly string[]).includes(tab);
}
