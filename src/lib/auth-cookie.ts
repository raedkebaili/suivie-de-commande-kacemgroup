/**
 * Shared constants and parsing helpers for the server-side authentication
 * cookie. Keeping parsing independent from the database makes the contract
 * easy to test and avoids duplicating cookie handling in route handlers.
 */
export const AUTH_COOKIE_NAME = "otp_token";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Return the exact auth cookie value from a Cookie header, if present. */
export function readAuthCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();
    if (name !== AUTH_COOKIE_NAME) continue;

    const rawValue = part.slice(separator + 1).trim();
    if (!rawValue) return null;

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return null;
    }
  }

  return null;
}
