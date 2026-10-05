CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" text NOT NULL,
	"action" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agencies_name_unique" UNIQUE("name"),
	CONSTRAINT "agencies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "app_colors" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_id" integer,
	"updated_by_name" text,
	CONSTRAINT "app_colors_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "archive_cell_colors" (
	"id" serial PRIMARY KEY NOT NULL,
	"sheet_id" integer NOT NULL,
	"row_id" integer NOT NULL,
	"column_index" integer NOT NULL,
	"color" text NOT NULL,
	"updated_by_id" integer,
	"updated_by_name" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "archive_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"sheet_id" integer NOT NULL,
	"row_index" integer NOT NULL,
	"cells" text NOT NULL,
	"state_detected" text,
	"state_override" text,
	"updated_by_id" integer,
	"updated_by_name" text,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "archive_sheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_filename" text,
	"sheet_index" integer DEFAULT 0 NOT NULL,
	"columns" text NOT NULL,
	"preamble" text,
	"reste_column_index" integer,
	"clients_column_index" integer,
	"affaire_column_index" integer,
	"state_column_index" integer,
	"row_count" integer DEFAULT 0 NOT NULL,
	"imported_by_id" integer,
	"imported_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "archive_sheets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "article_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "article_library_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "backup_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"filepath" text,
	"filesize" integer,
	"total_records" integer NOT NULL,
	"type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"backup_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" integer,
	"created_by_name" text
);
--> statement-breakpoint
CREATE TABLE "client_recouvrement_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"state_id" integer,
	"state_label" text,
	"note" text,
	"user_id" integer,
	"username" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_recouvrement_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"state_id" integer NOT NULL,
	"note" text,
	"updated_by_id" integer,
	"updated_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_recouvrement_states_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clients_name_unique" UNIQUE("name"),
	CONSTRAINT "clients_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "drive_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"study_id" integer,
	"drive_file_id" text NOT NULL,
	"drive_folder_id" text,
	"file_name" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"web_view_link" text,
	"category" text DEFAULT 'AUTRE' NOT NULL,
	"uploaded_by_id" integer,
	"uploaded_by_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expedition_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"cumulative_total" integer NOT NULL,
	"driver_name" text,
	"planned_loading_date" text,
	"delivered_by" text NOT NULL,
	"delivery_date" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factories" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"responsable_id" integer,
	"responsable_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "factories_code_unique" UNIQUE("code"),
	CONSTRAINT "factories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "item_technical_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"category_id" integer,
	"material_id" integer,
	"category_key" text NOT NULL,
	"category_name" text NOT NULL,
	"material_reference" text NOT NULL,
	"material_label" text NOT NULL,
	"is_telegestion" boolean DEFAULT false NOT NULL,
	"entered_by_id" integer,
	"entered_by_name" text NOT NULL,
	"entered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"is_telegestion" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "material_categories_key_unique" UNIQUE("key"),
	CONSTRAINT "material_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "matieres" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer,
	"category" text NOT NULL,
	"reference" text DEFAULT 'SANS-REF' NOT NULL,
	"name" text NOT NULL,
	"stock" double precision DEFAULT 0 NOT NULL,
	"specs" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modification_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer,
	"username" text NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"order_id" integer,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_counters_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"article_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"note" text,
	"client_spec" text,
	"is_telegestion" boolean DEFAULT false NOT NULL,
	"production_unit" text,
	"planned_loading_date" text,
	"pcb" text,
	"pcb_by" text,
	"pcb_at" text,
	"color_temperature" text,
	"color_temp_by" text,
	"color_temp_at" text,
	"lens" text,
	"lens_by" text,
	"lens_at" text,
	"driver" text,
	"driver_by" text,
	"driver_at" text,
	"electrical_class" text,
	"elec_class_by" text,
	"elec_class_at" text,
	"accessories" text,
	"accessories_by" text,
	"accessories_at" text,
	"other_tech_specs" text,
	"ots_by" text,
	"ots_at" text,
	"produced_qty" integer DEFAULT 0 NOT NULL,
	"delivered_qty" integer DEFAULT 0 NOT NULL,
	"delivery_date" text,
	"unit_price" double precision,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"order_date" text DEFAULT to_char(now(), 'YYYY-MM-DD') NOT NULL,
	"priority" text DEFAULT 'NORMALE' NOT NULL,
	"client_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"status" text DEFAULT 'PREVISION' NOT NULL,
	"production_status" text DEFAULT 'EN_INSTANCE' NOT NULL,
	"status_reason" text,
	"affaire" text,
	"cancel_reason" text,
	"cancelled_by" text,
	"cancelled_at" text,
	"created_by" integer,
	"created_by_name" text,
	"locked_by" integer,
	"locked_by_name" text,
	"locked_at" text,
	"tech_completed" boolean DEFAULT false,
	"planif_completed" boolean DEFAULT false,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "photometric_studies" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"client_id" integer,
	"client_name" text,
	"affaire_name" text,
	"study_number" text NOT NULL,
	"note" text,
	"created_by_id" integer,
	"created_by_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photometric_study_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"lens_id" integer,
	"lens_reference" text,
	"lens_label" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"cumulative_total" integer NOT NULL,
	"produced_by" text NOT NULL,
	"production_date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_plan_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_date" text NOT NULL,
	"factory_id" integer,
	"factory_name" text,
	"item_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"article_name" text NOT NULL,
	"order_number" text,
	"client_name" text,
	"planned_qty" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'EN_ATTENTE' NOT NULL,
	"reason" text,
	"applied_qty" integer DEFAULT 0 NOT NULL,
	"applied_at" text,
	"created_by_id" integer,
	"created_by_name" text,
	"updated_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_unit_lib" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "production_unit_lib_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "recouvrement_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"color_key" text DEFAULT 'RECOUVREMENT_GRAY' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recouvrement_states_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "storage_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'google_drive' NOT NULL,
	"client_id" text,
	"encrypted_client_secret" text,
	"google_account_email" text,
	"encrypted_refresh_token" text,
	"root_folder_id" text,
	"root_folder_name" text DEFAULT 'ORDERTRACK STORAGE' NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_error" text,
	"connected_at" text,
	"last_sync_at" text,
	"connected_by_id" integer,
	"connected_by_name" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_id" integer,
	"updated_by_name" text,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tech_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'commercial' NOT NULL,
	"full_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"dark_mode" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_colors" ADD CONSTRAINT "app_colors_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_cell_colors" ADD CONSTRAINT "archive_cell_colors_sheet_id_archive_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."archive_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_cell_colors" ADD CONSTRAINT "archive_cell_colors_row_id_archive_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."archive_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_cell_colors" ADD CONSTRAINT "archive_cell_colors_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rows" ADD CONSTRAINT "archive_rows_sheet_id_archive_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."archive_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rows" ADD CONSTRAINT "archive_rows_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_sheets" ADD CONSTRAINT "archive_sheets_imported_by_id_users_id_fk" FOREIGN KEY ("imported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_history" ADD CONSTRAINT "backup_history_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recouvrement_logs" ADD CONSTRAINT "client_recouvrement_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recouvrement_logs" ADD CONSTRAINT "client_recouvrement_logs_state_id_recouvrement_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."recouvrement_states"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recouvrement_logs" ADD CONSTRAINT "client_recouvrement_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recouvrement_states" ADD CONSTRAINT "client_recouvrement_states_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recouvrement_states" ADD CONSTRAINT "client_recouvrement_states_state_id_recouvrement_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."recouvrement_states"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recouvrement_states" ADD CONSTRAINT "client_recouvrement_states_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_documents" ADD CONSTRAINT "drive_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_documents" ADD CONSTRAINT "drive_documents_study_id_photometric_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."photometric_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_documents" ADD CONSTRAINT "drive_documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_batches" ADD CONSTRAINT "expedition_batches_item_id_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_batches" ADD CONSTRAINT "expedition_batches_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factories" ADD CONSTRAINT "factories_responsable_id_users_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_technical_components" ADD CONSTRAINT "item_technical_components_item_id_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_technical_components" ADD CONSTRAINT "item_technical_components_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_technical_components" ADD CONSTRAINT "item_technical_components_category_id_material_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."material_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_technical_components" ADD CONSTRAINT "item_technical_components_material_id_matieres_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."matieres"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_technical_components" ADD CONSTRAINT "item_technical_components_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matieres" ADD CONSTRAINT "matieres_category_id_material_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."material_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_logs" ADD CONSTRAINT "modification_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_logs" ADD CONSTRAINT "modification_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photometric_studies" ADD CONSTRAINT "photometric_studies_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photometric_studies" ADD CONSTRAINT "photometric_studies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photometric_studies" ADD CONSTRAINT "photometric_studies_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photometric_study_items" ADD CONSTRAINT "photometric_study_items_study_id_photometric_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."photometric_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photometric_study_items" ADD CONSTRAINT "photometric_study_items_lens_id_matieres_id_fk" FOREIGN KEY ("lens_id") REFERENCES "public"."matieres"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_item_id_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_entries" ADD CONSTRAINT "production_plan_entries_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_entries" ADD CONSTRAINT "production_plan_entries_item_id_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_entries" ADD CONSTRAINT "production_plan_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_entries" ADD CONSTRAINT "production_plan_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_config" ADD CONSTRAINT "storage_config_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_user_idx" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "archive_cell_colors_row_col_uq" ON "archive_cell_colors" USING btree ("row_id","column_index");--> statement-breakpoint
CREATE INDEX "archive_rows_sheet_idx" ON "archive_rows" USING btree ("sheet_id");--> statement-breakpoint
CREATE INDEX "client_recouvrement_logs_client_idx" ON "client_recouvrement_logs" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_documents_order_file_uq" ON "drive_documents" USING btree ("order_id","drive_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_documents_study_file_uq" ON "drive_documents" USING btree ("study_id","drive_file_id");--> statement-breakpoint
CREATE INDEX "drive_documents_order_idx" ON "drive_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "drive_documents_study_idx" ON "drive_documents" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "expedition_batches_item_idx" ON "expedition_batches" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "expedition_batches_order_idx" ON "expedition_batches" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "item_technical_components_item_idx" ON "item_technical_components" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_technical_components_order_idx" ON "item_technical_components" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "modification_logs_order_idx" ON "modification_logs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "notifications_order_idx" ON "notifications" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_client_idx" ON "orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "orders_agency_idx" ON "orders" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "orders_production_status_idx" ON "orders" USING btree ("production_status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "photometric_studies_order_idx" ON "photometric_studies" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "photometric_study_items_study_idx" ON "photometric_study_items" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "production_batches_item_idx" ON "production_batches" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "production_batches_order_idx" ON "production_batches" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "production_plan_entries_date_factory_idx" ON "production_plan_entries" USING btree ("plan_date","factory_id");--> statement-breakpoint
CREATE INDEX "production_plan_entries_status_idx" ON "production_plan_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_plan_entries_item_idx" ON "production_plan_entries" USING btree ("item_id");