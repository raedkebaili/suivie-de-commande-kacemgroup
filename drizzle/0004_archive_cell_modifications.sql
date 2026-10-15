CREATE TABLE IF NOT EXISTS "archive_cell_modifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "sheet_id" integer NOT NULL REFERENCES "archive_sheets"("id") ON DELETE CASCADE,
  "row_id" integer NOT NULL REFERENCES "archive_rows"("id") ON DELETE CASCADE,
  "column_index" integer NOT NULL,
  "modified_by_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "modified_by_name" text,
  "modified_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "archive_cell_modifications_row_col_uq" ON "archive_cell_modifications" USING btree ("row_id","column_index");
