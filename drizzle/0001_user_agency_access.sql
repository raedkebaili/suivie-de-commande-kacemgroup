CREATE TABLE "user_agency_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_agency_access_user_agency_unique" ON "user_agency_access" USING btree ("user_id","agency_id");
--> statement-breakpoint
CREATE INDEX "user_agency_access_user_idx" ON "user_agency_access" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_agency_access_agency_idx" ON "user_agency_access" USING btree ("agency_id");
--> statement-breakpoint
ALTER TABLE "user_agency_access" ADD CONSTRAINT "user_agency_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_agency_access" ADD CONSTRAINT "user_agency_access_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;
