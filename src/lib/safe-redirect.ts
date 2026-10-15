/**
 * Chemin de retour après connexion. Accepte uniquement un chemin interne à l'application
 * (commence par « / », pas de schéma, pas de « // », pas de barre oblique inversée).
 * Toute autre valeur revient à la page d'accueil : aucune redirection ouverte.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return fallback;
  if (trimmed.includes("\\") || /[\u0000-\u001f]/.test(trimmed)) return fallback;
  if (trimmed.includes("://")) return fallback;
  return trimmed;
}
