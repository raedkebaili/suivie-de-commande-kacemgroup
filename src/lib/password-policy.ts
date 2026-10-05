// ── Politique de mot de passe — CORRECTIF SÉCURITÉ (R10) ──────────────
// Module pur (aucún import serveur) : utilisable côté API comme côté client.

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  key: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { key: "length", label: `Au moins ${PASSWORD_MIN_LENGTH} caractères`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { key: "letter", label: "Au moins une lettre", test: (p) => /[A-Za-zÀ-ÿ]/.test(p) },
  { key: "digit", label: "Au moins un chiffre", test: (p) => /\d/.test(p) },
];

/** Retourne le libellé de la première règle non respectée, ou null si OK. */
export function passwordPolicyError(password: string): string | null {
  if (typeof password !== "string") return "Mot de passe requis";
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(password)) return rule.label;
  }
  return null;
}

/** Détail des règles pour affichage côté client (cases cochées). */
export function passwordRuleStates(password: string): { rule: PasswordRule; ok: boolean }[] {
  return PASSWORD_RULES.map((rule) => ({ rule, ok: !!password && rule.test(password) }));
}
