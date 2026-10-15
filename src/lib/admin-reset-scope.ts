/**
 * Périmètre du reset accessible depuis la session superadmin.
 * Les catalogues et référentiels sont volontairement hors périmètre.
 */
export const ORDER_RESET_TABLES = ["photometric_studies", "orders"] as const;
export const ORDER_COUNTER_TABLE = "order_counters" as const;
export const PRESERVED_REFERENCE_TABLES = ["matieres", "material_categories", "clients", "agencies"] as const;

export function buildOrderResetSql(): string {
  return `TRUNCATE TABLE ${ORDER_RESET_TABLES.join(", ")} RESTART IDENTITY CASCADE`;
}
