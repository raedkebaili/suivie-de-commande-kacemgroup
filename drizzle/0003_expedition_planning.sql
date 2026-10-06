CREATE TABLE "expedition_plan_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "plan_date" text NOT NULL,
  "item_id" integer NOT NULL,
  "order_id" integer NOT NULL,
  "article_name" text NOT NULL,
  "order_number" text,
  "client_name" text,
  "planned_qty" integer DEFAULT 0 NOT NULL,
  "loaded_qty" integer DEFAULT 0 NOT NULL,
  "driver_name" text NOT NULL,
  "status" text DEFAULT 'NON_TRAITE' NOT NULL,
  "note" text,
  "created_by_id" integer,
  "created_by_name" text,
  "updated_by_name" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expedition_plan_entries" ADD CONSTRAINT "expedition_plan_entries_item_id_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expedition_plan_entries" ADD CONSTRAINT "expedition_plan_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expedition_plan_entries" ADD CONSTRAINT "expedition_plan_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "expedition_plan_entries_date_driver_idx" ON "expedition_plan_entries" USING btree ("plan_date","driver_name");
--> statement-breakpoint
CREATE INDEX "expedition_plan_entries_item_idx" ON "expedition_plan_entries" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "expedition_plan_entries_status_idx" ON "expedition_plan_entries" USING btree ("status");
--> statement-breakpoint
-- Compatibilité avec les premières versions du planning : les lignes préparées
-- restent neutres et les lignes terminées sont déjà des livraisons réelles.
UPDATE "expedition_plan_entries" SET "status" = 'NON_TRAITE' WHERE "status" = 'PLANIFIE';
UPDATE "expedition_plan_entries" SET "status" = 'LIVRE' WHERE "status" = 'TERMINE';
--> statement-breakpoint
ALTER TABLE "expedition_plan_entries" ADD CONSTRAINT "expedition_plan_entries_status_check" CHECK ("status" IN ('NON_TRAITE', 'EN_COURS', 'ANNULE', 'LIVRE'));
