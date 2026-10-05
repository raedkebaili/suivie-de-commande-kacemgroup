import { beforeEach, describe, expect, it } from "vitest";
import { passwordPolicyError, PASSWORD_MIN_LENGTH } from "../password-policy";
import { consumeRateLimit, resetRateLimit } from "../rate-limit";
import { decryptSecret, encryptSecret, maskSecret } from "../crypto";
import { documentCategoryLabel, documentExtensionAllowed } from "../document-categories";
import { AUTH_COOKIE_NAME, readAuthCookie } from "../auth-cookie";

describe("password-policy (correctif R10)", () => {
  it("rejette les mots de passe faibles", () => {
    expect(passwordPolicyError("")).toBeTruthy();
    expect(passwordPolicyError("abcd")).toBeTruthy();          // trop court
    expect(passwordPolicyError("abcdefgh")).toBeTruthy();       // sans chiffre
    expect(passwordPolicyError("12345678")).toBeTruthy();       // sans lettre
  });

  it("accepte un mot de passe conforme", () => {
    expect(passwordPolicyError("Abcd1234")).toBeNull();
    expect(passwordPolicyError(`a1${"x".repeat(PASSWORD_MIN_LENGTH)}`)).toBeNull();
  });
});

describe("rate-limit (correctif R4 — anti force brute)", () => {
  it("bloque après maxAttempts dans la fenêtre", () => {
    const key = `test:${Date.now()}:a`;
    for (let i = 0; i < 5; i++) {
      expect(consumeRateLimit(key, 5, 60_000).allowed).toBe(true);
    }
    const blocked = consumeRateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resetRateLimit rétablit l'accès (login réussi)", () => {
    const key = `test:${Date.now()}:b`;
    for (let i = 0; i < 5; i++) consumeRateLimit(key, 5, 60_000);
    expect(consumeRateLimit(key, 5, 60_000).allowed).toBe(false);
    resetRateLimit(key);
    expect(consumeRateLimit(key, 5, 60_000).allowed).toBe(true);
  });

  it("une fenêtre expirée repart à zéro", async () => {
    const key = `test:${Date.now()}:c`;
    consumeRateLimit(key, 1, 5); // 5 ms
    await new Promise((r) => setTimeout(r, 15));
    expect(consumeRateLimit(key, 1, 5).allowed).toBe(true);
  });
});

describe("crypto AES-256-GCM (secrets au repos)", () => {
  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
  });

  it("chiffre puis déchiffre à l'identique", () => {
    const secret = "ya29.a0Af-token-refresh-x";
    const enc = encryptSecret(secret);
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("retourne null sur entrée invalide ou absente", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret("not-a-payload")).toBeNull();
    expect(decryptSecret("v1:a:b:corrompu")).toBeNull();
  });

  it("masque sans exposer le secret", () => {
    expect(maskSecret("1234567890abcdef")).toBe("123456••••cdef");
    expect(maskSecret("abc")).toBe("••••••");
    expect(maskSecret(null)).toBeNull();
  });
});

describe("document-categories (contrôle d'upload contextuel)", () => {
  it("accepte uniquement les extensions autorisées", () => {
    expect(documentExtensionAllowed("contrat.pdf")).toBe(true);
    expect(documentExtensionAllowed("plan.DWG".toLowerCase().replace("dwg", "xlsx"))).toBe(true);
    expect(documentExtensionAllowed("script.exe")).toBe(false);
    expect(documentExtensionAllowed("virus.pdf.exe")).toBe(false);
    expect(documentExtensionAllowed("archive.zip")).toBe(false);
  });

  it("retombe sur « Autre » pour une catégorie inconnue", () => {
    expect(documentCategoryLabel("CAHIER_DES_CHARGES")).toBe("Cahier des charges");
    expect(documentCategoryLabel("INCONNUE")).toBe("Autre");
    expect(documentCategoryLabel(null)).toBe("Autre");
  });
});

describe("auth-cookie (session HttpOnly)", () => {
  it("lit uniquement le cookie otp_token exact", () => {
    expect(readAuthCookie(`other=value; ${AUTH_COOKIE_NAME}=jwt-value; theme=dark`)).toBe("jwt-value");
    expect(readAuthCookie("otp_token_suffix=not-the-token")).toBeNull();
  });

  it("décode la valeur et ignore les cookies absents ou invalides", () => {
    expect(readAuthCookie(`${AUTH_COOKIE_NAME}=jwt%2Evalue`)).toBe("jwt.value");
    expect(readAuthCookie(null)).toBeNull();
    expect(readAuthCookie(`${AUTH_COOKIE_NAME}=%E0%A4%A`)).toBeNull();
  });
});
