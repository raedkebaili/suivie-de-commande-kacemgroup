import { passwordPolicyError } from "./password-policy";

/** Une base non vide ne doit jamais recréer un compte administrateur implicite. */
export function shouldSeedDefaultUser(existingUser: { id: number } | null | undefined): boolean {
  return !existingUser;
}

/** Valide la source du mot de passe initial sans jamais en stocker la valeur. */
export function initialAdminPasswordError(password: string | undefined): string | null {
  if (!password) return "INITIAL_ADMIN_PASSWORD est requis pour initialiser la première base utilisateur";
  const policyError = passwordPolicyError(password);
  return policyError ? `INITIAL_ADMIN_PASSWORD invalide : ${policyError}` : null;
}
