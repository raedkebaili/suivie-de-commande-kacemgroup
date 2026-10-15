CREATE TABLE IF NOT EXISTS "article_family_catalog" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "sub_family" text NOT NULL,
  "variant" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "article_family_catalog_uq" ON "article_family_catalog" USING btree ("category","sub_family","variant");

CREATE TABLE IF NOT EXISTS "article_family_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "designation" text NOT NULL,
  "catalog_id" integer NOT NULL REFERENCES "article_family_catalog"("id") ON DELETE CASCADE,
  "assigned_by_name" text,
  "assigned_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "article_family_assignments_designation_uq" ON "article_family_assignments" USING btree ("designation");

-- Catalogue prédéfini (insertion unique : ON CONFLICT ne duplique jamais une ligne)
INSERT INTO "article_family_catalog" ("category","sub_family","variant") VALUES
  ('LUMINAIRE D''ECLAIRAGE PUBLIQUE', 'NETLUX', ''),
  ('LUMINAIRE D''ECLAIRAGE PUBLIQUE', 'NETLUX', '2.0'),
  ('LUMINAIRE D''ECLAIRAGE PUBLIQUE', 'LUXSTAR', 'I'),
  ('LUMINAIRE D''ECLAIRAGE PUBLIQUE', 'LUXSTAR', 'II'),
  ('PROJECTEUR LED', 'APOLO', ''),
  ('PROJECTEUR LED', 'ASTRO', ''),
  ('PROJECTEUR LED', 'EUROARENA', ''),
  ('PROJECTEUR LED', 'EUROARENA', 'PRO'),
  ('PROJECTEUR LED', 'EUROSTATION', ''),
  ('PROJECTEUR LED', 'PROJECTEUR SOLAIRE', ''),
  ('PROJECTEUR LED', 'PROJECTEUR SUR RAILLE', ''),
  ('PROJECTEUR LED', 'MARACANA', ''),
  ('PROJECTEUR LED', 'APOLO', '+'),
  ('LUMINAIRE DE STYLE', 'MEDINA', ''),
  ('LUMINAIRE DE STYLE', 'TOKYO', ''),
  ('LUMINAIRE DE STYLE', 'ANDALUS', ''),
  ('LUMINAIRE DE STYLE', 'VENUS', ''),
  ('LUMINAIRE DE STYLE', 'CELIA', ''),
  ('LUMINAIRE DE STYLE', 'SPACE X', ''),
  ('POTEAU DE STYLE', 'POTEAU', '4m'),
  ('POTEAU DE STYLE', 'POTEAU', '3m')
ON CONFLICT ("category","sub_family","variant") DO NOTHING;
