export const SESSION_IDLE_TIMEOUT_KEY = "session_idle_timeout_minutes";
export const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 30;
export const MIN_SESSION_IDLE_TIMEOUT_MINUTES = 1;
export const MAX_SESSION_IDLE_TIMEOUT_MINUTES = 24 * 60;

export function parseSessionIdleTimeoutMinutes(value: string | null | undefined): number {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < MIN_SESSION_IDLE_TIMEOUT_MINUTES || minutes > MAX_SESSION_IDLE_TIMEOUT_MINUTES) {
    return DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES;
  }
  return minutes;
}
