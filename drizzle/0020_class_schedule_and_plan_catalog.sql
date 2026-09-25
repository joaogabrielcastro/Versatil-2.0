ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "code" varchar(64);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "category" varchar(64);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "kind" varchar(32) DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "term_months" integer;--> statement-breakpoint

ALTER TABLE "plans" ADD CONSTRAINT "plans_kind_check" CHECK ("kind" IN ('subscription', 'fee'));--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_term_months_positive" CHECK ("term_months" IS NULL OR "term_months" > 0);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_tenant_code" ON "plans" ("tenant_id","code") WHERE "code" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "class_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "category" varchar(64) NOT NULL,
  "code" varchar(64),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "class_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "activity_id" uuid NOT NULL,
  "weekday" integer NOT NULL,
  "start_time" varchar(5) NOT NULL,
  CONSTRAINT "class_slots_weekday" CHECK ("weekday" BETWEEN 1 AND 5),
  CONSTRAINT "class_slots_start_time" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);--> statement-breakpoint

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_activity_id_class_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "class_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "class_activities_tenant_idx" ON "class_activities" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_activities_tenant_code" ON "class_activities" ("tenant_id","code") WHERE "code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_slots_activity_idx" ON "class_slots" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_slots_tenant_idx" ON "class_slots" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_slots_activity_weekday_time" ON "class_slots" ("activity_id","weekday","start_time");--> statement-breakpoint

ALTER TABLE "class_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "class_activities_select" ON "class_activities" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "class_activities_insert" ON "class_activities" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "class_activities_update" ON "class_activities" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "class_activities_delete" ON "class_activities" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint

ALTER TABLE "class_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "class_slots_select" ON "class_slots" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "class_slots_insert" ON "class_slots" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "class_slots_update" ON "class_slots" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "class_slots_delete" ON "class_slots" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "class_activities", "class_slots" TO versatil_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "class_activities", "class_slots" TO versatil_platform;
