import { describe, expect, it } from "vitest";
import { createArticleRecognizer, extractArticlePower } from "../article-recognition";
import { PREDEFINED_ARTICLE_FAMILY_CATALOG as catalog } from "../article-family-catalog";
import { groupArticles } from "../article-grouping";

const recognize = createArticleRecognizer(catalog);
describe("reconnaissance à partir du catalogue administrateur", () => {
  it.each([
    ["Luminaire LED NETLUX 150W IP66 4000K", "NETLUX", 150],
    ["luminaire netlux 2,0 LED 75 W 230V", "NETLUX 2.0", 75],
    ["NETLUX2.0150W IP66", "NETLUX 2.0", 150],
    ["NETLUX2.0150", "NETLUX 2.0", 150],
    ["NETLUX-85", "NETLUX", 85],
    ["LUXSTAR II LED 100 W", "LUXSTAR II", 100],
    ["EUROARENA PRO 1.2 kW 4000K", "EUROARENA PRO", 1200],
    ["APOLO+200 W", "APOLO+", 200],
    ["Luminaire SPACE-X LED 12,5 watts", "SPACE X", 12.5],
    ["POTEAU 4m acier galvanisé", "POTEAU 4m", null],
    ["Projecteur solaire 50W avec télécommande", "PROJECTEUR SOLAIRE", 50],
  ])("%s → %s (%s W)", (name, family, power) => {
    const info = recognize(name);
    expect(info.familyKey).toBe(family);
    expect(info.power).toBe(power);
    expect(info.category).toBe(catalog.find((c) => (c.variant === "+" ? c.subFamily + "+" : [c.subFamily, c.variant].filter(Boolean).join(" ")) === family)?.category);
  });
  it("reconnaît une sous-famille créée par l’utilisateur, sans liste codée en dur", () => {
    const custom = createArticleRecognizer([{ category: "MA FAMILLE", subFamily: "NOVA CITY", variant: "V2" }]);
    expect(custom("Luminaire nova-city V2 LED 48W IP66")).toMatchObject({ familyKey: "NOVA CITY V2", category: "MA FAMILLE", power: 48 });
  });
  it("ne fusionne ni les préfixes proches ni les générations inconnues avec la base", () => {
    expect(recognize("NETLUXE LED 150 W").familyKey).toBeNull();
    expect(recognize("NETLUX 3.0 LED 100 W").familyKey).toBeNull();
    expect(recognize("LUXSTAR III LED 100 W").familyKey).toBeNull();
    expect(recognize("NETLUX ASTRO 100 W").familyKey).toBeNull();
    expect(recognize("APOLOPLUS LED 100 W").familyKey).toBeNull();
  });
  it("les affectations manuelles restent prioritaires, même après normalisation", () => {
    const manual = createArticleRecognizer(catalog, new Map([["NETLUX 100 W", "MEDINA"]]));
    expect(manual("netlux  100 w")).toMatchObject({ familyKey: "MEDINA", source: "MANUEL", category: "LUMINAIRE DE STYLE", power: 100 });
  });
  it("ne modifie pas la désignation ni les totaux et porte la vraie famille sur chaque ligne", () => {
    const articleName = "Luminaire LED NETLUX IP66 75W";
    const [group] = groupArticles([{ articleName, quantity: 10, producedQty: 8, deliveredQty: 3 }], undefined, catalog);
    expect(group.key).toBe("NETLUX");
    expect(group.totalQuantity).toBe(10); expect(group.totalRemaining).toBe(7);
    expect(group.lines[0]).toMatchObject({ articleName, familyCategory: "LUMINAIRE D'ECLAIRAGE PUBLIQUE", power: 75 });
  });
});
describe("lecture indépendante de la puissance", () => {
  it.each([
    ["Luminaire 100W LED 4000K 230V 50Hz IP66", 100],
    ["Projecteur 1,5 kW", 1500],
    ["Lampe LED 7 W", 7],
    ["Projecteur 2x50W", 100],
    ["Projecteur 3 × 12,5 watts", 37.5],
    ["Projecteur 100W (puissance 100W)", 100],
    ["Poteau 4m 230V IP66 4000K", null],
    ["Lampe 50/100W", null],
    ["Lampe 50-100W", null],
    ["Lampe 50W ou 100W", null],
  ])("%s → %s", (name, power) => expect(extractArticlePower(name)).toBe(power));
});
