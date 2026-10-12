/**
 * Visibilité des colonnes du tableau des commandes — configuration GLOBALE.
 *
 * Un réglage fait par le superadmin (colonne, état de production, ligne TOTAL)
 * s'applique à tous les utilisateurs : il est stocké dans system_settings et
 * lu par chaque utilisateur. Aucune préférence personnelle ne peut le modifier.
 *
 * Ce module est la source unique utilisée par la route API
 * (/api/orders/column-visibility) et par l'interface (OrdersView).
 */

/** Colonnes masquables du tableau principal (les autres restent toujours visibles). */
export const HIDEABLE_ORDER_COLUMNS = [
  "date",
  "agence",
  "affaire",
  "priorite",
  "etatComm",
  "creePar",
  "modifiePar",
] as const;

/** États de production masquables individuellement (badge seulement, pas la colonne ni la ligne). */
export const HIDEABLE_PRODUCTION_STATES = [
  "EN_INSTANCE",
  "EN_PRODUCTION",
  "AWAITING_DELIVERY",
  "LIVREE",
  "ANNULEE",
] as const;

/** Seuls ces rôles peuvent modifier la configuration globale. */
export const ORDER_COLUMN_VISIBILITY_MANAGER_ROLES = ["superadmin"] as const;

export function canManageOrderColumnVisibility(role: string | undefined | null): boolean {
  return !!role && (ORDER_COLUMN_VISIBILITY_MANAGER_ROLES as readonly string[]).includes(role);
}

/** Lit une liste JSON stockée ; ignore tout ce qui n'est pas une clé autorisée. */
export function parseStoredList<T extends string>(raw: string | undefined | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return sanitizeList(value, allowed);
  } catch {
    return [];
  }
}

/** Ne garde que les chaînes autorisées, sans doublon. */
export function sanitizeList<T extends string>(input: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(input)) return [];
  const result: T[] = [];
  for (const value of input) {
    if (typeof value === "string" && (allowed as readonly string[]).includes(value) && !result.includes(value as T)) {
      result.push(value as T);
    }
  }
  return result;
}

/** Ajoute ou retire une clé d'une liste (retourne une nouvelle liste). */
export function toggleListItem(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}
