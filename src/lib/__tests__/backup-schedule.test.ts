import { describe, expect, it } from "vitest";
import { backupDue, backupRetention, scheduledBackupDay } from "../backup-schedule";
import { matchesBackupSecret } from "../backup-cron-auth";
describe("échéances de sauvegarde Africa/Tunis", () => {
  it("rattrape une exécution manquée, sans dépendre de la minute exacte", () => {
    expect(backupDue({ now: new Date("2026-10-19T22:37:00Z"), lastSuccess: "2026-10-18T21:00:00Z" }).due).toBe(true);
    expect(scheduledBackupDay(new Date("2026-10-19T21:00:00Z"))).toBe("2026-10-19");
    expect(scheduledBackupDay(new Date("2026-10-19T20:59:00Z"))).toBe("2026-10-18");
  });
  it("ne recommence pas une échéance déjà réussie", () => {
    expect(backupDue({ now: new Date("2026-10-19T23:00:00Z"), lastSuccess: "2026-10-19T21:05:00Z" }).due).toBe(false);
  });
  it("une sauvegarde avant l'heure n'empêche pas celle du soir", () => {
    expect(backupDue({ now: new Date("2026-10-19T21:01:00Z"), lastSuccess: "2026-10-19T12:00:00Z" }).due).toBe(true);
  });
  it("un échec ne bloque pas la journée, avec un délai de reprise de dix minutes", () => {
    expect(backupDue({ now: new Date("2026-10-19T21:05:00Z"), lastAttempt: "2026-10-19T21:00:00Z", lastStatus: "error: panne" }).due).toBe(false);
    expect(backupDue({ now: new Date("2026-10-19T21:11:00Z"), lastAttempt: "2026-10-19T21:00:00Z", lastStatus: "error: panne" }).due).toBe(true);
  });
  it("gère minuit, les changements de mois et les fuseaux explicitement", () => {
    expect(scheduledBackupDay(new Date("2026-11-01T00:00:00Z"))).toBe("2026-10-31");
    expect(scheduledBackupDay(new Date("2026-10-19T21:00:00Z"), "22:00", "UTC")).toBe("2026-10-18");
    expect(() => scheduledBackupDay(new Date(), "25:00")).toThrow();
  });
  it("borne la rétention et refuse les secrets absents/incorrects", () => {
    for (const value of [undefined, "", "0", "-1", "400", "NaN", "2.5"]) expect(backupRetention(value)).toBe(30);
    expect(backupRetention("2")).toBe(2);
    expect(matchesBackupSecret("Bearer abc", "Bearer abc")).toBe(true);
    expect(matchesBackupSecret(null, "abc")).toBe(false);
    expect(matchesBackupSecret("abc", undefined)).toBe(false);
    expect(matchesBackupSecret("wrong", "abc")).toBe(false);
  });
});
