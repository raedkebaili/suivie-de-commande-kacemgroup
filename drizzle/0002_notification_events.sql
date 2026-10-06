ALTER TABLE "notifications" ADD COLUMN "event_key" text DEFAULT 'LEGACY_INFO' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "severity" text DEFAULT 'info' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "target_tab" text;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "read_at" timestamp;
--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");
