import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
  MAX_SESSION_IDLE_TIMEOUT_MINUTES,
  MIN_SESSION_IDLE_TIMEOUT_MINUTES,
  parseSessionIdleTimeoutMinutes,
} from "../session-timeout";

describe("session idle timeout", () => {
  it("utilise 30 minutes par défaut", () => {
    expect(parseSessionIdleTimeoutMinutes(undefined)).toBe(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES);
    expect(parseSessionIdleTimeoutMinutes("invalide")).toBe(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES);
  });

  it("accepte uniquement une durée entière dans les limites", () => {
    expect(parseSessionIdleTimeoutMinutes("15")).toBe(15);
    expect(parseSessionIdleTimeoutMinutes(String(MIN_SESSION_IDLE_TIMEOUT_MINUTES - 1))).toBe(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES);
    expect(parseSessionIdleTimeoutMinutes(String(MAX_SESSION_IDLE_TIMEOUT_MINUTES + 1))).toBe(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES);
    expect(parseSessionIdleTimeoutMinutes("15.5")).toBe(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES);
  });
});
