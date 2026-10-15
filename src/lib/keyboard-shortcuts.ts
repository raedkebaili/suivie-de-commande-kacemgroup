/**
 * Raccourcis clavier de l'application (logique pure, sans dépendance React).
 *
 * Convention : Alt + lettre/chiffre. Alt seul évite les conflits avec les
 * raccourcis de saisie (Ctrl+C/V…) et ceux du navigateur les plus utilisés
 * (Ctrl+N/T/W…). Les touches de menu du navigateur (Alt+F, E, V, S, T, H, D,
 * B) sont volontairement exclues.
 *
 * - Les lettres sont reconnues via `event.key` (disposition AZERTY/QWERTY) ;
 *   si la touche ne produit pas de lettre (ex. Option sur macOS), on retombe
 *   sur la position physique `event.code`.
 * - Les chiffres sont reconnus via `event.code` (sur AZERTY, « 1 » est produit
 *   par la touche « & » sans Maj).
 * - Ctrl, Maj et Meta ne sont jamais acceptés avec Alt (évite AltGr et les
 *   combinaisons système).
 */

/** Champ minimal lu sur un KeyboardEvent (facilite les tests). */
export interface ShortcutKeyEvent {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

/** Actions demandées à une vue (ouverture de formulaire, affichage…). */
export type ShortcutAction =
  | "new-order"
  | "new-photo-study"
  | "plan-production"
  | "plan-expedition"
  | "new-client"
  | "new-agency"
  | "new-factory"
  | "toggle-fullscreen"
  | "focus-search"
  | "show-help";

export type ShortcutGroup = "Créer" | "Naviguer" | "Affichage" | "Aide";

export interface ShortcutDefinition {
  id: string;
  /** Libellé affiché à l'utilisateur, ex. « Alt+N ». */
  label: string;
  description: string;
  group: ShortcutGroup;
  /** Onglet requis. Absent = raccourci global. */
  tab?: string;
  /** Action transmise à la vue (sinon navigation simple). */
  action?: ShortcutAction;
  trigger:
    | { type: "alt-letter"; letter: string }
    | { type: "alt-digit"; digit: string }
    | { type: "key"; key: "F1" | "/" };
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  // ── Créer ─────────────────────────────────────────────
  { id: "new-order", label: "Alt+N", description: "Nouvelle commande", group: "Créer", tab: "orders", action: "new-order", trigger: { type: "alt-letter", letter: "n" } },
  { id: "new-photo-study", label: "Alt+I", description: "Nouvelle étude photométrique", group: "Créer", tab: "orders", action: "new-photo-study", trigger: { type: "alt-letter", letter: "i" } },
  { id: "plan-production", label: "Alt+P", description: "Planifier des articles (planning de production)", group: "Créer", tab: "planning", action: "plan-production", trigger: { type: "alt-letter", letter: "p" } },
  { id: "plan-expedition", label: "Alt+X", description: "Planifier une expédition", group: "Créer", tab: "expeditionPlanning", action: "plan-expedition", trigger: { type: "alt-letter", letter: "x" } },
  { id: "new-client", label: "Alt+C", description: "Nouveau client", group: "Créer", tab: "clients", action: "new-client", trigger: { type: "alt-letter", letter: "c" } },
  { id: "new-agency", label: "Alt+G", description: "Nouvelle agence", group: "Créer", tab: "agencies", action: "new-agency", trigger: { type: "alt-letter", letter: "g" } },
  { id: "new-factory", label: "Alt+U", description: "Nouvelle usine", group: "Créer", tab: "factories", action: "new-factory", trigger: { type: "alt-letter", letter: "u" } },

  // ── Naviguer ──────────────────────────────────────────
  { id: "nav-dashboard", label: "Alt+1", description: "Tableau de bord", group: "Naviguer", tab: "dashboard", trigger: { type: "alt-digit", digit: "1" } },
  { id: "nav-orders", label: "Alt+O", description: "Commandes", group: "Naviguer", tab: "orders", trigger: { type: "alt-letter", letter: "o" } },
  { id: "nav-archive", label: "Alt+A", description: "Archive commandes", group: "Naviguer", tab: "archive", trigger: { type: "alt-letter", letter: "a" } },
  { id: "nav-recouvrement", label: "Alt+R", description: "Recouvrement", group: "Naviguer", tab: "recouvrement", trigger: { type: "alt-letter", letter: "r" } },

  // ── Affichage ─────────────────────────────────────────
  { id: "toggle-fullscreen", label: "Alt+M", description: "Tableau en plein écran (Commandes, Archive) — Échap pour quitter", group: "Affichage", action: "toggle-fullscreen", trigger: { type: "alt-letter", letter: "m" } },
  { id: "focus-search", label: "/", description: "Rechercher (hors saisie de texte)", group: "Affichage", action: "focus-search", trigger: { type: "key", key: "/" } },

  // ── Aide ──────────────────────────────────────────────
  { id: "show-help", label: "F1", description: "Afficher la liste des raccourcis", group: "Aide", action: "show-help", trigger: { type: "key", key: "F1" } },
];

const LETTER_RE = /^[a-z]$/;

function hasOnlyAlt(event: ShortcutKeyEvent): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function hasNoModifier(event: ShortcutKeyEvent): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

/** Vrai si la cible accepte la saisie (les raccourcis simples y sont ignorés). */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  if (el.isContentEditable) return true;
  const tag = (el.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function matchesAltLetter(event: ShortcutKeyEvent, letter: string): boolean {
  const key = (event.key || "").toLowerCase();
  if (LETTER_RE.test(key)) return key === letter;
  // Touche qui ne produit pas une lettre (ex. Option sur macOS) : position physique.
  return event.code === `Key${letter.toUpperCase()}`;
}

function matchesAltDigit(event: ShortcutKeyEvent, digit: string): boolean {
  return event.code === `Digit${digit}` || event.code === `Numpad${digit}`;
}

/**
 * Retourne le raccourci correspondant à l'événement, ou null.
 * `editable` indique si le focus est dans un champ de saisie : dans ce cas,
 * seuls les raccourcis Alt+… restent actifs.
 */
export function resolveShortcut(event: ShortcutKeyEvent, options: { editable?: boolean } = {}): ShortcutDefinition | null {
  if (event.isComposing || event.repeat) return null;
  for (const def of SHORTCUTS) {
    const t = def.trigger;
    if (t.type === "alt-letter") {
      if (hasOnlyAlt(event) && matchesAltLetter(event, t.letter)) return def;
    } else if (t.type === "alt-digit") {
      if (hasOnlyAlt(event) && matchesAltDigit(event, t.digit)) return def;
    } else if (t.key === "F1") {
      if (hasNoModifier(event) && event.key === "F1") return def;
    } else if (t.key === "/") {
      if (hasNoModifier(event) && event.key === "/" && !options.editable) return def;
    }
  }
  return null;
}

/** Raccourcis disponibles pour un ensemble d'onglets autorisés (aide affichée). */
export function shortcutsForTabs(allowedTabs: readonly string[]): ShortcutDefinition[] {
  return SHORTCUTS.filter((def) => !def.tab || allowedTabs.includes(def.tab));
}

/** Demande transmise à la vue active par la page. */
export interface ShortcutRequest {
  id: number;
  action: ShortcutAction;
  /** Onglet concerné : la demande est abandonnée si l'utilisateur change d'onglet. */
  tab: string;
}
