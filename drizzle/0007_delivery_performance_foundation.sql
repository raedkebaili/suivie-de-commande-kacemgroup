-- Additive foundation only. No seeds, no grants, no KPI activation.
CREATE TABLE "dpm_audit_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"operation" text NOT NULL,
	"reason" text NOT NULL,
	"request_key" uuid NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"capability_used" text NOT NULL,
	"factory_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dpm_calendar_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"calendar_id" integer NOT NULL,
	"day" date NOT NULL,
	"working" boolean NOT NULL,
	"intervals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"validated_by_id" integer,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_calendar_days_validation_ck" CHECK (("dpm_calendar_days"."validated_at" IS NULL) = ("dpm_calendar_days"."validated_by_id" IS NULL)),
	CONSTRAINT "dpm_calendar_days_source_ck" CHECK (length(trim("dpm_calendar_days"."reason")) > 0 AND length(trim("dpm_calendar_days"."source")) > 0 AND jsonb_typeof("dpm_calendar_days"."intervals") = 'array')
);
--> statement-breakpoint
CREATE TABLE "dpm_calendars" (
	"id" serial PRIMARY KEY NOT NULL,
	"calendar_key" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Africa/Tunis' NOT NULL,
	"working_weekdays" jsonb DEFAULT '[1,2,3,4,5,6]'::jsonb NOT NULL,
	"working_intervals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_calendars_version_ck" CHECK ("dpm_calendars"."version" > 0),
	CONSTRAINT "dpm_calendars_json_ck" CHECK (jsonb_typeof("dpm_calendars"."working_weekdays") = 'array' AND jsonb_typeof("dpm_calendars"."working_intervals") = 'object')
);
--> statement-breakpoint
CREATE TABLE "dpm_commitments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"version" integer NOT NULL,
	"previous_id" integer,
	"original_order_date" date NOT NULL,
	"confirmed_due_date" date NOT NULL,
	"calendar_id" integer NOT NULL,
	"agreed_items" jsonb NOT NULL,
	"reason" text NOT NULL,
	"client_requested" boolean DEFAULT false NOT NULL,
	"proof_document_id" integer,
	"decision" text DEFAULT 'PENDING' NOT NULL,
	"validated_by_id" integer,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_commitments_version_ck" CHECK ("dpm_commitments"."version" > 0 AND (("dpm_commitments"."version" = 1 AND "dpm_commitments"."previous_id" IS NULL) OR ("dpm_commitments"."version" > 1 AND "dpm_commitments"."previous_id" IS NOT NULL))),
	CONSTRAINT "dpm_commitments_decision_ck" CHECK ("dpm_commitments"."decision" IN ('PENDING','APPROVED','REJECTED') AND jsonb_typeof("dpm_commitments"."agreed_items") = 'array' AND jsonb_array_length("dpm_commitments"."agreed_items") > 0 AND length(trim("dpm_commitments"."reason")) > 0),
	CONSTRAINT "dpm_commitments_validation_ck" CHECK (("dpm_commitments"."decision" = 'PENDING' AND "dpm_commitments"."validated_at" IS NULL AND "dpm_commitments"."validated_by_id" IS NULL) OR ("dpm_commitments"."decision" <> 'PENDING' AND "dpm_commitments"."validated_at" IS NOT NULL AND "dpm_commitments"."validated_by_id" IS NOT NULL AND "dpm_commitments"."proof_document_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "dpm_corrective_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"event_id" integer,
	"factory_id" integer NOT NULL,
	"category_5m" text NOT NULL,
	"root_cause" text NOT NULL,
	"action" text NOT NULL,
	"owner_id" integer NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"effectiveness" text,
	"verified_by_id" integer,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_corrective_actions_target_ck" CHECK ("dpm_corrective_actions"."order_id" IS NOT NULL OR "dpm_corrective_actions"."event_id" IS NOT NULL),
	CONSTRAINT "dpm_corrective_actions_5m_ck" CHECK ("dpm_corrective_actions"."category_5m" IN ('MANPOWER','METHODS','MACHINES','MATERIALS','ENVIRONMENT')),
	CONSTRAINT "dpm_corrective_actions_status_ck" CHECK ("dpm_corrective_actions"."status" IN ('OPEN','IN_PROGRESS','VERIFY','CLOSED') AND ("dpm_corrective_actions"."status" <> 'CLOSED' OR ("dpm_corrective_actions"."verified_by_id" IS NOT NULL AND "dpm_corrective_actions"."verified_at" IS NOT NULL AND length(trim("dpm_corrective_actions"."effectiveness")) > 0)))
);
--> statement-breakpoint
CREATE TABLE "dpm_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"number" text NOT NULL,
	"dispatch_factory_id" integer NOT NULL,
	"delivery_note_reference" text,
	"actual_delivery_at" timestamp with time zone,
	"request_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_deliveries_number_ck" CHECK (length(trim("dpm_deliveries"."number")) > 0)
);
--> statement-breakpoint
CREATE TABLE "dpm_delivery_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"manufacturing_factory_id" integer NOT NULL,
	"commitment_id" integer NOT NULL,
	"planned_qty" integer NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_delivery_lines_quantity_ck" CHECK ("dpm_delivery_lines"."planned_qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "dpm_delivery_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dpm_event_impacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"event_version" integer NOT NULL,
	"order_id" integer NOT NULL,
	"commitment_id" integer NOT NULL,
	"critical_path_key" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"demonstrated_impact" text NOT NULL,
	"claimed_minutes" integer NOT NULL,
	"admissible_minutes" integer DEFAULT 0 NOT NULL,
	"decision" text DEFAULT 'PENDING' NOT NULL,
	"validator_comment" text,
	"proof_document_id" integer,
	"validated_by_id" integer,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_event_impacts_duration_ck" CHECK ("dpm_event_impacts"."ends_at" > "dpm_event_impacts"."starts_at" AND "dpm_event_impacts"."event_version" > 0 AND "dpm_event_impacts"."claimed_minutes" >= 0 AND "dpm_event_impacts"."admissible_minutes" >= 0 AND "dpm_event_impacts"."admissible_minutes" <= "dpm_event_impacts"."claimed_minutes"),
	CONSTRAINT "dpm_event_impacts_decision_ck" CHECK ("dpm_event_impacts"."decision" IN ('PENDING','APPROVED','PARTIAL','REJECTED') AND ("dpm_event_impacts"."decision" NOT IN ('PENDING','REJECTED') OR "dpm_event_impacts"."admissible_minutes" = 0)),
	CONSTRAINT "dpm_event_impacts_validation_ck" CHECK (("dpm_event_impacts"."decision" = 'PENDING' AND "dpm_event_impacts"."validated_at" IS NULL AND "dpm_event_impacts"."validated_by_id" IS NULL) OR ("dpm_event_impacts"."decision" <> 'PENDING' AND "dpm_event_impacts"."validated_at" IS NOT NULL AND "dpm_event_impacts"."validated_by_id" IS NOT NULL AND length(trim("dpm_event_impacts"."validator_comment")) > 0 AND ("dpm_event_impacts"."decision" = 'REJECTED' OR "dpm_event_impacts"."proof_document_id" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "dpm_event_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"event_version" integer NOT NULL,
	"step" text NOT NULL,
	"decision" text NOT NULL,
	"comment" text NOT NULL,
	"evidence_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_event_reviews_step_ck" CHECK ("dpm_event_reviews"."step" IN ('DECLARATION','TECHNICAL','IMPACT','LOGISTICS','INDUSTRIAL') AND "dpm_event_reviews"."event_version" > 0),
	CONSTRAINT "dpm_event_reviews_decision_ck" CHECK ("dpm_event_reviews"."decision" IN ('APPROVED','PARTIAL','REJECTED') AND length(trim("dpm_event_reviews"."comment")) > 0)
);
--> statement-breakpoint
CREATE TABLE "dpm_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"factory_id" integer NOT NULL,
	"origin" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"resource_key" text NOT NULL,
	"production_stopped" boolean DEFAULT false NOT NULL,
	"detailed_cause" text NOT NULL,
	"request_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_events_origin_ck" CHECK ("dpm_events"."origin" IN ('INTERNAL','EXTERNAL')),
	CONSTRAINT "dpm_events_dates_ck" CHECK ("dpm_events"."ends_at" IS NULL OR "dpm_events"."ends_at" >= "dpm_events"."starts_at"),
	CONSTRAINT "dpm_events_version_ck" CHECK ("dpm_events"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "dpm_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"factory_id" integer,
	"capability" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_grants_capability_ck" CHECK ("dpm_grants"."capability" IN ('READ','DECLARE','TECHNICAL_REVIEW','IMPACT_ANALYSIS','LOGISTICS_REVIEW','INDUSTRIAL_APPROVAL','CONFIGURE'))
);
--> statement-breakpoint
CREATE TABLE "dpm_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"reference" text NOT NULL,
	"kind" text NOT NULL,
	"step_code" text NOT NULL,
	"factory_id" integer NOT NULL,
	"destination_factory_id" integer,
	"calendar_id" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"actual_at" timestamp with time zone,
	"proof_document_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_milestones_kind_ck" CHECK ("dpm_milestones"."kind" IN ('TRANSFER','PROCESS') AND ("dpm_milestones"."kind" <> 'TRANSFER' OR ("dpm_milestones"."destination_factory_id" IS NOT NULL AND "dpm_milestones"."destination_factory_id" <> "dpm_milestones"."factory_id")))
);
--> statement-breakpoint
CREATE TABLE "dpm_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_id" integer NOT NULL,
	"reference" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"received_qty" integer NOT NULL,
	"accepted_qty" integer DEFAULT 0 NOT NULL,
	"rejected_qty" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"correction_of_id" integer,
	"proof_document_id" integer,
	"validated_by_id" integer,
	"validated_at" timestamp with time zone,
	"request_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_receipts_quantity_ck" CHECK ("dpm_receipts"."received_qty" >= 0 AND "dpm_receipts"."accepted_qty" >= 0 AND "dpm_receipts"."rejected_qty" >= 0 AND "dpm_receipts"."accepted_qty" + "dpm_receipts"."rejected_qty" <= "dpm_receipts"."received_qty"),
	CONSTRAINT "dpm_receipts_status_ck" CHECK ("dpm_receipts"."status" IN ('PENDING','ACCEPTED','PARTIAL','REJECTED')),
	CONSTRAINT "dpm_receipts_validation_ck" CHECK (("dpm_receipts"."status" = 'PENDING' AND "dpm_receipts"."accepted_qty" = 0 AND "dpm_receipts"."rejected_qty" = 0 AND "dpm_receipts"."validated_at" IS NULL AND "dpm_receipts"."validated_by_id" IS NULL) OR ("dpm_receipts"."status" <> 'PENDING' AND "dpm_receipts"."validated_at" IS NOT NULL AND "dpm_receipts"."validated_by_id" IS NOT NULL AND "dpm_receipts"."proof_document_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "dpm_site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"factory_id" integer NOT NULL,
	"reporting_code" text NOT NULL,
	"region_code" text NOT NULL,
	"calendar_id" integer,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer NOT NULL,
	CONSTRAINT "dpm_site_settings_code_ck" CHECK (length(trim("dpm_site_settings"."reporting_code")) > 0 AND length(trim("dpm_site_settings"."region_code")) > 0),
	CONSTRAINT "dpm_site_settings_calendar_ck" CHECK (NOT "dpm_site_settings"."enabled" OR "dpm_site_settings"."calendar_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "dpm_audit_records" ADD CONSTRAINT "dpm_audit_records_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_audit_records" ADD CONSTRAINT "dpm_audit_records_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_calendar_days" ADD CONSTRAINT "dpm_calendar_days_calendar_id_dpm_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."dpm_calendars"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_calendar_days" ADD CONSTRAINT "dpm_calendar_days_validated_by_id_users_id_fk" FOREIGN KEY ("validated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_calendar_days" ADD CONSTRAINT "dpm_calendar_days_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_calendars" ADD CONSTRAINT "dpm_calendars_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_commitments" ADD CONSTRAINT "dpm_commitments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_commitments" ADD CONSTRAINT "dpm_commitments_previous_id_dpm_commitments_id_fk" FOREIGN KEY ("previous_id") REFERENCES "public"."dpm_commitments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_commitments" ADD CONSTRAINT "dpm_commitments_calendar_id_dpm_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."dpm_calendars"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_commitments" ADD CONSTRAINT "dpm_commitments_proof_document_id_drive_documents_id_fk" FOREIGN KEY ("proof_document_id") REFERENCES "public"."drive_documents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_commitments" ADD CONSTRAINT "dpm_commitments_validated_by_id_users_id_fk" FOREIGN KEY ("validated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_commitments" ADD CONSTRAINT "dpm_commitments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_corrective_actions" ADD CONSTRAINT "dpm_corrective_actions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_corrective_actions" ADD CONSTRAINT "dpm_corrective_actions_event_id_dpm_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dpm_events"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_corrective_actions" ADD CONSTRAINT "dpm_corrective_actions_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_corrective_actions" ADD CONSTRAINT "dpm_corrective_actions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_corrective_actions" ADD CONSTRAINT "dpm_corrective_actions_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_corrective_actions" ADD CONSTRAINT "dpm_corrective_actions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_deliveries" ADD CONSTRAINT "dpm_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_deliveries" ADD CONSTRAINT "dpm_deliveries_dispatch_factory_id_factories_id_fk" FOREIGN KEY ("dispatch_factory_id") REFERENCES "public"."factories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_deliveries" ADD CONSTRAINT "dpm_deliveries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_delivery_lines" ADD CONSTRAINT "dpm_delivery_lines_delivery_id_dpm_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."dpm_deliveries"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_delivery_lines" ADD CONSTRAINT "dpm_delivery_lines_item_id_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_delivery_lines" ADD CONSTRAINT "dpm_delivery_lines_manufacturing_factory_id_factories_id_fk" FOREIGN KEY ("manufacturing_factory_id") REFERENCES "public"."factories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_delivery_lines" ADD CONSTRAINT "dpm_delivery_lines_commitment_id_dpm_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."dpm_commitments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_delivery_lines" ADD CONSTRAINT "dpm_delivery_lines_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_delivery_movements" ADD CONSTRAINT "dpm_delivery_movements_line_id_dpm_delivery_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."dpm_delivery_lines"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_delivery_movements" ADD CONSTRAINT "dpm_delivery_movements_batch_id_expedition_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."expedition_batches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_delivery_movements" ADD CONSTRAINT "dpm_delivery_movements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_event_impacts" ADD CONSTRAINT "dpm_event_impacts_event_id_dpm_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dpm_events"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_event_impacts" ADD CONSTRAINT "dpm_event_impacts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_event_impacts" ADD CONSTRAINT "dpm_event_impacts_commitment_id_dpm_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."dpm_commitments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_event_impacts" ADD CONSTRAINT "dpm_event_impacts_proof_document_id_drive_documents_id_fk" FOREIGN KEY ("proof_document_id") REFERENCES "public"."drive_documents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_event_impacts" ADD CONSTRAINT "dpm_event_impacts_validated_by_id_users_id_fk" FOREIGN KEY ("validated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_event_impacts" ADD CONSTRAINT "dpm_event_impacts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_event_reviews" ADD CONSTRAINT "dpm_event_reviews_event_id_dpm_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dpm_events"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_event_reviews" ADD CONSTRAINT "dpm_event_reviews_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_events" ADD CONSTRAINT "dpm_events_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_events" ADD CONSTRAINT "dpm_events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_grants" ADD CONSTRAINT "dpm_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_grants" ADD CONSTRAINT "dpm_grants_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_grants" ADD CONSTRAINT "dpm_grants_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_milestones" ADD CONSTRAINT "dpm_milestones_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_milestones" ADD CONSTRAINT "dpm_milestones_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_milestones" ADD CONSTRAINT "dpm_milestones_destination_factory_id_factories_id_fk" FOREIGN KEY ("destination_factory_id") REFERENCES "public"."factories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_milestones" ADD CONSTRAINT "dpm_milestones_calendar_id_dpm_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."dpm_calendars"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_milestones" ADD CONSTRAINT "dpm_milestones_proof_document_id_drive_documents_id_fk" FOREIGN KEY ("proof_document_id") REFERENCES "public"."drive_documents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_milestones" ADD CONSTRAINT "dpm_milestones_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_receipts" ADD CONSTRAINT "dpm_receipts_line_id_dpm_delivery_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."dpm_delivery_lines"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_receipts" ADD CONSTRAINT "dpm_receipts_correction_of_id_dpm_receipts_id_fk" FOREIGN KEY ("correction_of_id") REFERENCES "public"."dpm_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_receipts" ADD CONSTRAINT "dpm_receipts_proof_document_id_drive_documents_id_fk" FOREIGN KEY ("proof_document_id") REFERENCES "public"."drive_documents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_receipts" ADD CONSTRAINT "dpm_receipts_validated_by_id_users_id_fk" FOREIGN KEY ("validated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_receipts" ADD CONSTRAINT "dpm_receipts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_site_settings" ADD CONSTRAINT "dpm_site_settings_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_site_settings" ADD CONSTRAINT "dpm_site_settings_calendar_id_dpm_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."dpm_calendars"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dpm_site_settings" ADD CONSTRAINT "dpm_site_settings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_audit_records_request_uq" ON "dpm_audit_records" USING btree ("request_key");
--> statement-breakpoint
CREATE INDEX "dpm_audit_records_entity_idx" ON "dpm_audit_records" USING btree ("entity_type","entity_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_calendar_days_day_uq" ON "dpm_calendar_days" USING btree ("calendar_id","day");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_calendars_key_version_uq" ON "dpm_calendars" USING btree ("calendar_key","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_commitments_version_uq" ON "dpm_commitments" USING btree ("order_id","version");
--> statement-breakpoint
CREATE INDEX "dpm_commitments_due_idx" ON "dpm_commitments" USING btree ("confirmed_due_date","decision");
--> statement-breakpoint
CREATE INDEX "dpm_corrective_actions_due_idx" ON "dpm_corrective_actions" USING btree ("factory_id","status","due_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_deliveries_number_uq" ON "dpm_deliveries" USING btree ("dispatch_factory_id","number");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_deliveries_request_uq" ON "dpm_deliveries" USING btree ("request_key");
--> statement-breakpoint
CREATE INDEX "dpm_deliveries_order_idx" ON "dpm_deliveries" USING btree ("order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_delivery_lines_item_uq" ON "dpm_delivery_lines" USING btree ("delivery_id","item_id","manufacturing_factory_id");
--> statement-breakpoint
CREATE INDEX "dpm_delivery_lines_due_idx" ON "dpm_delivery_lines" USING btree ("due_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_delivery_movements_batch_uq" ON "dpm_delivery_movements" USING btree ("batch_id");
--> statement-breakpoint
CREATE INDEX "dpm_delivery_movements_line_idx" ON "dpm_delivery_movements" USING btree ("line_id");
--> statement-breakpoint
CREATE INDEX "dpm_event_impacts_order_idx" ON "dpm_event_impacts" USING btree ("order_id","decision");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_event_impacts_interval_uq" ON "dpm_event_impacts" USING btree ("event_id","event_version","order_id","critical_path_key","starts_at","ends_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_event_reviews_step_uq" ON "dpm_event_reviews" USING btree ("event_id","event_version","step");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_events_reference_uq" ON "dpm_events" USING btree ("reference");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_events_request_uq" ON "dpm_events" USING btree ("request_key");
--> statement-breakpoint
CREATE INDEX "dpm_events_factory_start_idx" ON "dpm_events" USING btree ("factory_id","starts_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_grants_site_uq" ON "dpm_grants" USING btree ("user_id","factory_id","capability") WHERE "dpm_grants"."factory_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_grants_global_uq" ON "dpm_grants" USING btree ("user_id","capability") WHERE "dpm_grants"."factory_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_milestones_reference_uq" ON "dpm_milestones" USING btree ("order_id","reference");
--> statement-breakpoint
CREATE INDEX "dpm_milestones_due_idx" ON "dpm_milestones" USING btree ("factory_id","due_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_receipts_reference_uq" ON "dpm_receipts" USING btree ("line_id","reference");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_receipts_request_uq" ON "dpm_receipts" USING btree ("request_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_receipts_correction_uq" ON "dpm_receipts" USING btree ("correction_of_id") WHERE "dpm_receipts"."correction_of_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_site_settings_factory_uq" ON "dpm_site_settings" USING btree ("factory_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "dpm_site_settings_code_uq" ON "dpm_site_settings" USING btree ("reporting_code");
--> statement-breakpoint
-- Journal append-only, y compris face à TRUNCATE. Le propriétaire PostgreSQL
-- reste une autorité privilégiée : utiliser un compte applicatif non propriétaire.
CREATE FUNCTION dpm_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Delivery performance audit records are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dpm_audit_no_update_delete BEFORE UPDATE OR DELETE ON dpm_audit_records
FOR EACH STATEMENT EXECUTE FUNCTION dpm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER dpm_audit_no_truncate BEFORE TRUNCATE ON dpm_audit_records
FOR EACH STATEMENT EXECUTE FUNCTION dpm_reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION dpm_immutable_fact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DPM immutable fact: append a revision instead';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dpm_commitments_immutable BEFORE UPDATE OR DELETE ON dpm_commitments
FOR EACH ROW EXECUTE FUNCTION dpm_immutable_fact();
CREATE TRIGGER dpm_reviews_immutable BEFORE UPDATE OR DELETE ON dpm_event_reviews
FOR EACH ROW EXECUTE FUNCTION dpm_immutable_fact();
CREATE TRIGGER dpm_receipts_immutable BEFORE UPDATE OR DELETE ON dpm_receipts
FOR EACH ROW EXECUTE FUNCTION dpm_immutable_fact();
CREATE TRIGGER dpm_impacts_immutable BEFORE UPDATE OR DELETE ON dpm_event_impacts
FOR EACH ROW EXECUTE FUNCTION dpm_immutable_fact();
--> statement-breakpoint
CREATE FUNCTION dpm_validate_commitment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry jsonb; prev dpm_commitments; item_order integer; seen integer[] := '{}';
BEGIN
  PERFORM 1 FROM orders WHERE id = NEW.order_id FOR NO KEY UPDATE;
  IF NEW.previous_id IS NOT NULL THEN
    SELECT * INTO STRICT prev FROM dpm_commitments WHERE id = NEW.previous_id;
    IF prev.order_id <> NEW.order_id OR prev.version + 1 <> NEW.version OR prev.original_order_date <> NEW.original_order_date
      OR (prev.approval_factory_id IS NOT NULL AND prev.approval_factory_id IS DISTINCT FROM NEW.approval_factory_id) THEN
      RAISE EXCEPTION 'DPM inconsistent commitment revision';
    END IF;
  END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(NEW.agreed_items) LOOP
    IF jsonb_typeof(entry) <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(entry)) <> 2
      OR NOT entry ?& ARRAY['itemId','quantity'] OR jsonb_typeof(entry->'itemId') IS DISTINCT FROM 'number' OR jsonb_typeof(entry->'quantity') IS DISTINCT FROM 'number' OR (entry->>'itemId') !~ '^[1-9][0-9]*$'
      OR (entry->>'quantity') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'DPM invalid agreed item JSON';
    END IF;
    SELECT order_id INTO STRICT item_order FROM order_items WHERE id = (entry->>'itemId')::integer;
    IF item_order <> NEW.order_id OR (entry->>'itemId')::integer = ANY(seen) THEN
      RAISE EXCEPTION 'DPM wrong or duplicate order item';
    END IF;
    seen := array_append(seen, (entry->>'itemId')::integer);
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_commitment_consistency BEFORE INSERT ON dpm_commitments
FOR EACH ROW EXECUTE FUNCTION dpm_validate_commitment();
--> statement-breakpoint
CREATE FUNCTION dpm_validate_delivery_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_order integer; item_order integer; contract dpm_commitments; agreed integer; reserved bigint;
BEGIN
  SELECT order_id INTO STRICT parent_order FROM dpm_deliveries WHERE id = NEW.delivery_id;
  PERFORM 1 FROM orders WHERE id = parent_order FOR NO KEY UPDATE;
  SELECT order_id INTO STRICT item_order FROM order_items WHERE id = NEW.item_id FOR UPDATE;
  SELECT * INTO STRICT contract FROM dpm_commitments WHERE id = NEW.commitment_id;
  IF item_order <> parent_order OR contract.order_id <> parent_order OR (contract.decision <> 'APPROVED' AND NOT EXISTS(SELECT 1 FROM dpm_commitment_decisions WHERE commitment_id=contract.id AND decision='APPROVED')) THEN
    RAISE EXCEPTION 'DPM delivery order/item/commitment mismatch';
  END IF;
  SELECT (e->>'quantity')::integer INTO agreed FROM jsonb_array_elements(contract.agreed_items) e WHERE (e->>'itemId')::integer = NEW.item_id;
  SELECT coalesce(sum(l.planned_qty),0) INTO reserved FROM dpm_delivery_lines l
    JOIN dpm_deliveries d ON d.id = l.delivery_id WHERE d.order_id = parent_order AND l.item_id = NEW.item_id;
  IF agreed IS NULL OR reserved + NEW.planned_qty > agreed OR NEW.due_date <> contract.confirmed_due_date THEN
    RAISE EXCEPTION 'DPM delivery exceeds commitment or wrong due date';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_delivery_line_consistency BEFORE INSERT ON dpm_delivery_lines
FOR EACH ROW EXECUTE FUNCTION dpm_validate_delivery_line();
CREATE TRIGGER dpm_delivery_lines_immutable BEFORE UPDATE OR DELETE ON dpm_delivery_lines
FOR EACH ROW EXECUTE FUNCTION dpm_immutable_fact();
CREATE TRIGGER dpm_deliveries_immutable BEFORE UPDATE OR DELETE ON dpm_deliveries
FOR EACH ROW EXECUTE FUNCTION dpm_immutable_fact();
--> statement-breakpoint
CREATE FUNCTION dpm_validate_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line dpm_delivery_lines; batch expedition_batches; parent_order integer; total bigint;
BEGIN
  SELECT * INTO STRICT line FROM dpm_delivery_lines WHERE id = NEW.line_id FOR UPDATE;
  SELECT order_id INTO STRICT parent_order FROM dpm_deliveries WHERE id = line.delivery_id;
  SELECT * INTO STRICT batch FROM expedition_batches WHERE id = NEW.batch_id;
  IF batch.item_id <> line.item_id OR batch.order_id <> parent_order THEN
    RAISE EXCEPTION 'DPM wrong expedition batch association';
  END IF;
  SELECT coalesce(sum(b.quantity),0) INTO total FROM dpm_delivery_movements m
    JOIN expedition_batches b ON b.id = m.batch_id WHERE m.line_id = NEW.line_id;
  IF total + batch.quantity < 0 OR total + batch.quantity > line.planned_qty THEN
    RAISE EXCEPTION 'DPM signed shipment quantity outside commitment';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_movement_consistency BEFORE INSERT ON dpm_delivery_movements
FOR EACH ROW EXECUTE FUNCTION dpm_validate_movement();
CREATE TRIGGER dpm_movements_immutable BEFORE UPDATE OR DELETE ON dpm_delivery_movements
FOR EACH ROW EXECUTE FUNCTION dpm_immutable_fact();
--> statement-breakpoint
CREATE FUNCTION dpm_validate_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE required_step text; current_version integer;
BEGIN
  SELECT version INTO STRICT current_version FROM dpm_events WHERE id = NEW.event_id FOR UPDATE;
  IF current_version <> NEW.event_version THEN RAISE EXCEPTION 'DPM stale event version'; END IF;
  required_step := CASE NEW.step WHEN 'TECHNICAL' THEN 'DECLARATION' WHEN 'IMPACT' THEN 'TECHNICAL' WHEN 'LOGISTICS' THEN 'IMPACT' WHEN 'INDUSTRIAL' THEN 'LOGISTICS' ELSE NULL END;
  IF required_step IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dpm_event_reviews WHERE event_id = NEW.event_id AND event_version = NEW.event_version AND step = required_step AND decision IN ('APPROVED','PARTIAL')) THEN
    RAISE EXCEPTION 'DPM missing approved previous workflow step';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_review_consistency BEFORE INSERT ON dpm_event_reviews
FOR EACH ROW EXECUTE FUNCTION dpm_validate_review();
--> statement-breakpoint
CREATE FUNCTION dpm_valid_intervals(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE span jsonb; previous_end text := '00:00'; first_time text; last_time text;
BEGIN
  IF jsonb_typeof(value) <> 'array' THEN RETURN false; END IF;
  FOR span IN SELECT * FROM jsonb_array_elements(value) LOOP
    IF jsonb_typeof(span) <> 'object' OR NOT span ?& ARRAY['start','end'] OR (SELECT count(*) FROM jsonb_object_keys(span)) <> 2 THEN RETURN false; END IF;
    first_time := span->>'start'; last_time := span->>'end';
    IF first_time IS NULL OR last_time IS NULL OR first_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR last_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR first_time >= last_time OR first_time < previous_end THEN RETURN false; END IF;
    previous_end := last_time;
  END LOOP;
  RETURN true;
END;
$$;
CREATE FUNCTION dpm_valid_weekdays(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE day jsonb; seen text[] := '{}';
BEGIN
  IF jsonb_typeof(value) <> 'array' OR jsonb_array_length(value) = 0 THEN RETURN false; END IF;
  FOR day IN SELECT * FROM jsonb_array_elements(value) LOOP
    IF jsonb_typeof(day) <> 'number' OR day::text !~ '^[1-7]$' OR day::text = ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen,day::text);
  END LOOP;
  RETURN true;
END;
$$;
CREATE FUNCTION dpm_valid_week_intervals(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE key text; spans jsonb;
BEGIN
  IF jsonb_typeof(value) <> 'object' THEN RETURN false; END IF;
  FOR key, spans IN SELECT * FROM jsonb_each(value) LOOP
    IF key !~ '^[1-7]$' OR NOT dpm_valid_intervals(spans) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;
ALTER TABLE dpm_calendars ADD CONSTRAINT dpm_calendar_weekdays_strict CHECK(dpm_valid_weekdays(working_weekdays));
ALTER TABLE dpm_calendars ADD CONSTRAINT dpm_calendar_hours_strict CHECK(dpm_valid_week_intervals(working_intervals));
ALTER TABLE dpm_calendar_days ADD CONSTRAINT dpm_calendar_day_hours_strict CHECK(dpm_valid_intervals(intervals) AND (working OR intervals = '[]'::jsonb));
--> statement-breakpoint
CREATE FUNCTION dpm_validate_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line dpm_delivery_lines; shipped bigint; received bigint; old dpm_receipts;
BEGIN
  SELECT * INTO STRICT line FROM dpm_delivery_lines WHERE id = NEW.line_id FOR UPDATE;
  SELECT coalesce(sum(b.quantity),0) INTO shipped FROM dpm_delivery_movements m JOIN expedition_batches b ON b.id = m.batch_id WHERE m.line_id = NEW.line_id;
  IF NEW.correction_of_id IS NOT NULL THEN
    SELECT * INTO STRICT old FROM dpm_receipts WHERE id = NEW.correction_of_id;
    IF old.line_id <> NEW.line_id THEN RAISE EXCEPTION 'DPM receipt correction from different line'; END IF;
  END IF;
  SELECT coalesce(sum(r.received_qty),0) INTO received FROM dpm_receipts r
    WHERE r.line_id = NEW.line_id AND r.id IS DISTINCT FROM NEW.correction_of_id
    AND NOT EXISTS(SELECT 1 FROM dpm_receipts c WHERE c.correction_of_id = r.id);
  IF received + NEW.received_qty > shipped OR received + NEW.received_qty > line.planned_qty THEN
    RAISE EXCEPTION 'DPM receipt exceeds net shipped quantity';
  END IF;
  IF (NEW.status = 'ACCEPTED' AND (NEW.accepted_qty <> NEW.received_qty OR NEW.rejected_qty <> 0 OR NEW.received_qty = 0))
    OR (NEW.status = 'REJECTED' AND (NEW.rejected_qty <> NEW.received_qty OR NEW.accepted_qty <> 0 OR NEW.received_qty = 0))
    OR (NEW.status = 'PARTIAL' AND (NEW.accepted_qty <= 0 OR NEW.accepted_qty >= NEW.received_qty)) THEN
    RAISE EXCEPTION 'DPM inconsistent receipt status';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_receipt_consistency BEFORE INSERT ON dpm_receipts
FOR EACH ROW EXECUTE FUNCTION dpm_validate_receipt();
--> statement-breakpoint
CREATE TRIGGER dpm_events_immutable BEFORE UPDATE OR DELETE ON dpm_events
FOR EACH ROW EXECUTE FUNCTION dpm_immutable_fact();
--> statement-breakpoint
-- Necessary protection on the existing document association: an approved
-- proof must not be silently replaced by editing drive_file_id in place.
CREATE FUNCTION dpm_protect_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM dpm_commitments WHERE proof_document_id=OLD.id)
    OR EXISTS(SELECT 1 FROM dpm_receipts WHERE proof_document_id=OLD.id)
    OR EXISTS(SELECT 1 FROM dpm_event_impacts WHERE proof_document_id=OLD.id)
    OR EXISTS(SELECT 1 FROM dpm_milestones WHERE proof_document_id=OLD.id)
    OR EXISTS(SELECT 1 FROM dpm_commitment_decisions WHERE proof_document_id=OLD.id)
    OR EXISTS(SELECT 1 FROM dpm_event_reviews WHERE evidence_snapshot @> jsonb_build_array(OLD.id)) THEN
    RAISE EXCEPTION 'DPM protected evidence association';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_document_protection BEFORE UPDATE OR DELETE ON drive_documents
FOR EACH ROW EXECUTE FUNCTION dpm_protect_document();
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['dpm_commitments','dpm_event_reviews','dpm_receipts','dpm_event_impacts','dpm_deliveries','dpm_delivery_lines','dpm_delivery_movements','dpm_events'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION dpm_immutable_fact()',relation_name || '_no_truncate',relation_name);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION dpm_validate_impact() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_version integer; contract_order integer;
BEGIN
  SELECT version INTO STRICT current_version FROM dpm_events WHERE id=NEW.event_id FOR UPDATE;
  SELECT order_id INTO STRICT contract_order FROM dpm_commitments WHERE id=NEW.commitment_id;
  IF current_version <> NEW.event_version OR contract_order <> NEW.order_id THEN
    RAISE EXCEPTION 'DPM impact commitment/order/version mismatch';
  END IF;
  IF NEW.decision IN ('APPROVED','PARTIAL') AND NOT EXISTS(
    SELECT 1 FROM dpm_event_reviews WHERE event_id=NEW.event_id AND event_version=NEW.event_version
    AND step='INDUSTRIAL' AND decision IN ('APPROVED','PARTIAL')
  ) THEN RAISE EXCEPTION 'DPM impact requires industrial approval'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_impact_consistency BEFORE INSERT ON dpm_event_impacts
FOR EACH ROW EXECUTE FUNCTION dpm_validate_impact();
--> statement-breakpoint
ALTER TABLE dpm_calendars ADD COLUMN published_by_id integer REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE dpm_calendars ADD COLUMN publication_reason text;
ALTER TABLE dpm_calendars ADD CONSTRAINT dpm_calendar_publication_ck CHECK
 ((published_at IS NULL AND published_by_id IS NULL AND publication_reason IS NULL)
 OR (published_at IS NOT NULL AND published_by_id IS NOT NULL AND length(trim(publication_reason)) > 0));
ALTER TABLE dpm_events ADD COLUMN correction_of_id integer REFERENCES dpm_events(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX dpm_events_correction_uq ON dpm_events(correction_of_id) WHERE correction_of_id IS NOT NULL;
CREATE TABLE dpm_commitment_decisions (
 id serial PRIMARY KEY, commitment_id integer NOT NULL REFERENCES dpm_commitments(id) ON DELETE RESTRICT,
 factory_id integer NOT NULL REFERENCES factories(id) ON DELETE RESTRICT,
 decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')), reason text NOT NULL CHECK(length(trim(reason)) > 0),
 proof_document_id integer NOT NULL REFERENCES drive_documents(id) ON DELETE RESTRICT,
 request_key uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
 created_by_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 UNIQUE(commitment_id)
);
CREATE TRIGGER dpm_decisions_immutable BEFORE UPDATE OR DELETE ON dpm_commitment_decisions
 FOR EACH ROW EXECUTE FUNCTION dpm_immutable_fact();
CREATE TRIGGER dpm_decisions_no_truncate BEFORE TRUNCATE ON dpm_commitment_decisions
 FOR EACH STATEMENT EXECUTE FUNCTION dpm_immutable_fact();
--> statement-breakpoint
CREATE FUNCTION dpm_validate_commitment_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE submission dpm_commitments;
BEGIN
 SELECT * INTO STRICT submission FROM dpm_commitments WHERE id=NEW.commitment_id FOR UPDATE;
 IF submission.approval_factory_id IS DISTINCT FROM NEW.factory_id THEN RAISE EXCEPTION 'DPM decision outside submission site'; END IF;
 IF submission.decision <> 'PENDING' THEN RAISE EXCEPTION 'DPM submission already final'; END IF;
 IF NOT EXISTS(SELECT 1 FROM dpm_grants WHERE user_id=NEW.created_by_id AND active AND EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by_id AND active)
 AND capability='INDUSTRIAL_APPROVAL' AND (factory_id=NEW.factory_id OR factory_id IS NULL)) THEN
 RAISE EXCEPTION 'DPM explicit industrial capability required'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_decision_validation BEFORE INSERT ON dpm_commitment_decisions
 FOR EACH ROW EXECUTE FUNCTION dpm_validate_commitment_decision();
--> statement-breakpoint
CREATE FUNCTION dpm_freeze_calendar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.published_at IS NOT NULL THEN RAISE EXCEPTION 'DPM publish existing draft only'; END IF;
 IF TG_OP <> 'INSERT' AND OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'DPM published calendar immutable'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'DPM calendar immutable: append a version'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['published_at','published_by_id','publication_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['published_at','published_by_id','publication_reason']) THEN RAISE EXCEPTION 'DPM calendar immutable: append a version'; END IF;
 IF NEW.published_at IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.working_weekdays) d WHERE NOT NEW.working_intervals ? (d::text) OR jsonb_array_length(NEW.working_intervals->(d::text))=0) THEN
 RAISE EXCEPTION 'DPM publication requires explicit working intervals'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_calendar_freeze BEFORE INSERT OR UPDATE OR DELETE ON dpm_calendars
 FOR EACH ROW EXECUTE FUNCTION dpm_freeze_calendar();
CREATE FUNCTION dpm_freeze_calendar_day() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE calendar_id_to_check integer;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'DPM calendar exception immutable: append a calendar version'; END IF;
 calendar_id_to_check := NEW.calendar_id;
 PERFORM 1 FROM dpm_calendars WHERE id=calendar_id_to_check FOR UPDATE;
 IF EXISTS(SELECT 1 FROM dpm_calendars WHERE id=calendar_id_to_check AND published_at IS NOT NULL) THEN RAISE EXCEPTION 'DPM published calendar exceptions immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_calendar_day_freeze BEFORE INSERT OR UPDATE OR DELETE ON dpm_calendar_days
 FOR EACH ROW EXECUTE FUNCTION dpm_freeze_calendar_day();
--> statement-breakpoint
CREATE FUNCTION dpm_validate_event_correction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous dpm_events;
BEGIN
 IF NEW.correction_of_id IS NOT NULL THEN
  SELECT * INTO STRICT previous FROM dpm_events WHERE id=NEW.correction_of_id FOR UPDATE;
  IF NEW.factory_id<>previous.factory_id OR NEW.version<>previous.version+1 THEN RAISE EXCEPTION 'DPM correction site/version mismatch'; END IF;
 ELSIF NEW.version<>1 THEN RAISE EXCEPTION 'DPM event initial version must be 1'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_event_correction_validation BEFORE INSERT ON dpm_events
 FOR EACH ROW EXECUTE FUNCTION dpm_validate_event_correction();
CREATE FUNCTION dpm_validate_review_proofs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proof jsonb;
BEGIN
 IF jsonb_typeof(NEW.evidence_snapshot) <> 'array' THEN RAISE EXCEPTION 'DPM proof snapshot must be an array'; END IF;
 FOR proof IN SELECT * FROM jsonb_array_elements(NEW.evidence_snapshot) LOOP
  IF jsonb_typeof(proof)<>'number' OR proof::text !~ '^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'DPM proof snapshot requires document ids'; END IF;
  PERFORM 1 FROM drive_documents WHERE id=(proof::text)::integer FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DPM proof document missing'; END IF;
 END LOOP;
 RETURN NEW;
END;
$$;
CREATE TRIGGER dpm_review_proof_validation BEFORE INSERT ON dpm_event_reviews
 FOR EACH ROW EXECUTE FUNCTION dpm_validate_review_proofs();

--> statement-breakpoint
ALTER TABLE dpm_commitments ADD COLUMN approval_factory_id integer REFERENCES factories(id) ON DELETE RESTRICT;
ALTER TABLE dpm_commitments ADD CONSTRAINT dpm_pending_approval_site_ck CHECK(decision <> 'PENDING' OR approval_factory_id IS NOT NULL);

CREATE TRIGGER dpm_calendars_no_truncate BEFORE TRUNCATE ON dpm_calendars FOR EACH STATEMENT EXECUTE FUNCTION dpm_immutable_fact();
CREATE TRIGGER dpm_calendar_days_no_truncate BEFORE TRUNCATE ON dpm_calendar_days FOR EACH STATEMENT EXECUTE FUNCTION dpm_immutable_fact();
