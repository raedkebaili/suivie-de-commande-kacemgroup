/** Reconnaissance pilotée par le catalogue administrateur ; aucun accès DB. */
import { classifyArticleDesignation, normalizeDesignation, resolveDesignationFamily, type ResolvedDesignationFamily } from "./article-family";
import { catalogLabel, type ArticleFamilyCatalogEntry } from "./article-family-catalog";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = (value: string) => normalizeDesignation(value).replace(/[’‘]/g, "'").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
const labelPattern = (value: string) => normalize(value).split(" ").map(escapeRegex).join("\\s*");

type CatalogEntry = ArticleFamilyCatalogEntry & { id?: number };
export type RecognizedArticle = ResolvedDesignationFamily & { category: string | null; catalogId: number | null; power: number | null };

/** Lit les unités explicites, sans confondre tension, flux, température et puissance. */
export function extractArticlePower(designation: string): number | null {
  const text = normalizeDesignation(designation);
  const compact = classifyArticleDesignation(designation);
  if (compact.power !== null) return compact.power > 0 ? compact.power : null;
  const matches: { start: number; end: number; value: number }[] = [];
  const unit = "(KW|W(?:ATTS?)?)(?![A-Z0-9])";
  const multiple = new RegExp(`(\\d+)\\s*[X×*]\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}`, "g");
  for (const m of text.matchAll(multiple)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, value: Number(m[1]) * Number(m[2]) * (m[3] === "KW" ? 1000 : 1) });
  }
  const single = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}`, "g");
  for (const m of text.matchAll(single)) {
    const start = m.index!;
    if (matches.some((hit) => start >= hit.start && start < hit.end)) continue;
    // Une plage « 50-100 W » / « 50/100 W » ne désigne pas une puissance unique.
    if (/\d\s*[-/–]\s*$/.test(text.slice(0, start))) return null;
    matches.push({ start, end: start + m[0].length, value: Number(m[1]) * (m[2] === "KW" ? 1000 : 1) });
  }
  const values = [...new Set(matches.map((m) => Math.round(m.value * 1000) / 1000))];
  return values.length === 1 && values[0] > 0 && Number.isFinite(values[0]) ? values[0] : null;
}

/** Compilation une seule fois par chargement, puis réutilisation pour tous les articles. */
export function createArticleRecognizer(catalog: readonly CatalogEntry[] = [], manualFamilies: ReadonlyMap<string, string> = new Map()) {
  const patterns = catalog.map((entry) => ({ entry, label: catalogLabel(entry), regex: new RegExp(`(^|[^A-Z0-9+])(${labelPattern(catalogLabel(entry))})(?=$|[^A-Z+])`, "g") }));
  const byLabel = new Map(catalog.map((entry) => [normalize(catalogLabel(entry)), entry]));
  const normalizedManual = new Map<string, Set<string>>();
  for (const [designation, label] of manualFamilies) {
    const key = normalize(designation);
    const labels = normalizedManual.get(key) || new Set<string>(); labels.add(label); normalizedManual.set(key, labels);
  }
  return (designation: string): RecognizedArticle => {
    const text = normalize(designation);
    const manualMatches = normalizedManual.get(text);
    const manualLabel = manualFamilies.get(designation) || (manualMatches?.size === 1 ? [...manualMatches][0] : null);
    const auto = classifyArticleDesignation(designation);
    let power = extractArticlePower(designation);
    const result = (resolved: ResolvedDesignationFamily, entry?: CatalogEntry): RecognizedArticle => ({ ...resolved, category: entry?.category || null, catalogId: entry?.id ?? null, power });
    if (manualLabel) {
      const entry = byLabel.get(normalize(manualLabel));
      if (entry) {
        const withoutModel = text.replace(new RegExp(labelPattern(catalogLabel(entry))), " ");
        power = extractArticlePower(withoutModel) ?? power;
      }
      return result(resolveDesignationFamily(designation, manualLabel), entry);
    }

    const hits: { entry: CatalogEntry; start: number; end: number }[] = [];
    for (const { entry, regex } of patterns) {
      regex.lastIndex = 0;
      for (const m of text.matchAll(regex)) {
        const start = m.index! + m[1].length;
        const end = start + m[2].length;
        const tail = text.slice(end);
        // Un modèle connu ne doit pas absorber une génération/variante inconnue.
        if (!entry.variant && (/^\s*\+/.test(tail) || /^\s*\d+\.\d/.test(tail) || /^\s*(?:[IVX]+|PRO|PLUS)(?=\s|$)/.test(tail))) continue;
        // Ex. LUXSTAR I ne doit pas absorber LUXSTAR II.
        if (/^[A-Z]/.test(tail)) continue;
        hits.push({ entry, start, end });
      }
    }
    const specific = hits.filter((hit) => !hits.some((other) => other !== hit && other.start <= hit.start && other.end >= hit.end && other.end - other.start > hit.end - hit.start));
    const labels = new Set(specific.map((hit) => catalogLabel(hit.entry)));
    if (labels.size > 1) return result({ status: "A_CLASSIFIER", familyKey: null, source: null });
    const hit = specific[0];
    if (hit) {
      power = extractArticlePower(text.slice(0, hit.start) + " " + text.slice(hit.end));
      // Les variantes compactes (NETLUX2.0150) et puissances sans unité restent lisibles.
      const suffix = text.slice(hit.end).trim().replace(/^[\s:;/-]+|[\s:;/-]+$/g, "");
      if (power === null && /^\d{1,5}(?:\.\d+)?$/.test(suffix) && Number(suffix) > 0) power = Number(suffix);
      return result({ status: "RECONNU", familyKey: catalogLabel(hit.entry), source: "AUTOMATIQUE" }, hit.entry);
    }
    const entry = auto.familyKey ? byLabel.get(normalize(auto.familyKey)) : undefined;
    return result(resolveDesignationFamily(designation), entry);
  };
}
