import { describe, expect, it } from "vitest";
import { isEditableTarget, resolveShortcut, shortcutsForTabs, SHORTCUTS, type ShortcutKeyEvent } from "../keyboard-shortcuts";

function ev(partial: Partial<ShortcutKeyEvent> & { key: string }): ShortcutKeyEvent {
  return { code: "", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, isComposing: false, ...partial };
}

const altLetter = (letter: string, extra: Partial<ShortcutKeyEvent> = {}) =>
  ev({ key: letter, code: `Key${letter.toUpperCase()}`, altKey: true, ...extra });

describe("raccourcis clavier", () => {
  it("ouvre la création de commande avec Alt+N", () => {
    expect(resolveShortcut(altLetter("n"))?.id).toBe("new-order");
    expect(resolveShortcut(altLetter("N"))?.id).toBe("new-order");
  });

  it("fonctionne sur une disposition AZERTY (la lettre produite est utilisée)", () => {
    // Touche physique QWERTY « Q » = lettre « A » sur AZERTY : doit ouvrir l'archive, pas la touche Q.
    expect(resolveShortcut(ev({ key: "a", code: "KeyQ", altKey: true }))?.id).toBe("nav-archive");
  });

  it("retombe sur la position physique si la touche ne produit pas une lettre (macOS Option)", () => {
    expect(resolveShortcut(ev({ key: "π", code: "KeyP", altKey: true }))?.id).toBe("plan-production");
  });

  it("reconnaît les chiffres par position physique (AZERTY : « & » produit « 1 » sans Maj)", () => {
    expect(resolveShortcut(ev({ key: "&", code: "Digit1", altKey: true }))?.id).toBe("nav-dashboard");
  });

  it("ignore Ctrl, Maj et Meta combinés à Alt (AltGr et raccourcis système)", () => {
    expect(resolveShortcut(altLetter("n", { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(altLetter("n", { shiftKey: true }))).toBeNull();
    expect(resolveShortcut(altLetter("n", { metaKey: true }))).toBeNull();
  });

  it("ignore les répétitions automatiques (maintien de touche) et la composition IME", () => {
    expect(resolveShortcut(altLetter("n", { repeat: true }))).toBeNull();
    expect(resolveShortcut(altLetter("n", { isComposing: true }))).toBeNull();
  });

  it("ignore les lettres sans Alt", () => {
    expect(resolveShortcut(ev({ key: "n", code: "KeyN" }))).toBeNull();
  });

  it("n'attribue aucune combinaison au menu du navigateur (Alt+F/E/V/S/T/H/D/B)", () => {
    for (const letter of ["f", "e", "v", "s", "t", "h", "d", "b"]) {
      expect(resolveShortcut(altLetter(letter))).toBeNull();
    }
  });

  it("« / » ouvre la recherche seulement hors champ de saisie", () => {
    const slash = ev({ key: "/", code: "Slash" });
    expect(resolveShortcut(slash)?.id).toBe("focus-search");
    expect(resolveShortcut(slash, { editable: true })).toBeNull();
  });

  it("F1 affiche l'aide, même dans un champ", () => {
    expect(resolveShortcut(ev({ key: "F1", code: "F1" }), { editable: true })?.id).toBe("show-help");
  });

  it("n'attribue jamais deux fois la même combinaison", () => {
    const labels = SHORTCUTS.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("chaque raccourci de création cible un onglet et une action", () => {
    const creates = SHORTCUTS.filter((s) => s.group === "Créer");
    expect(creates.length).toBeGreaterThanOrEqual(7);
    for (const s of creates) {
      expect(s.tab).toBeTruthy();
      expect(s.action).toBeTruthy();
    }
  });

  it("l'aide ne propose que les raccourcis des onglets autorisés", () => {
    const ids = shortcutsForTabs(["orders"]).map((s) => s.id);
    expect(ids).toContain("new-order");
    expect(ids).toContain("toggle-fullscreen");
    expect(ids).not.toContain("new-client");
    expect(ids).not.toContain("plan-production");
  });
});

describe("détection des champs de saisie", () => {
  it("reconnaît input, textarea, select et contenu éditable", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("ne considère pas un bouton ou un élément vide comme éditable", () => {
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
