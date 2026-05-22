CREATE TABLE "public"."workout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"exercises" jsonb NOT NULL,
	"is_preset" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public"."student_workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"template_id" uuid,
	"name" varchar(255) NOT NULL,
	"exercises" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public"."workout_templates" ADD CONSTRAINT "workout_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "public"."student_workouts" ADD CONSTRAINT "student_workouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "public"."student_workouts" ADD CONSTRAINT "student_workouts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "public"."student_workouts" ADD CONSTRAINT "student_workouts_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workout_templates_tenant_idx" ON "public"."workout_templates" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "workout_templates_tenant_active_idx" ON "public"."workout_templates" USING btree ("tenant_id","active");
--> statement-breakpoint
CREATE INDEX "student_workouts_tenant_student_idx" ON "public"."student_workouts" USING btree ("tenant_id","student_id");
--> statement-breakpoint
CREATE INDEX "student_workouts_student_idx" ON "public"."student_workouts" USING btree ("student_id");
--> statement-breakpoint
CREATE INDEX "access_events_tenant_student_allowed_idx" ON "public"."access_events" USING btree ("tenant_id","student_id","created_at") WHERE "allowed" = true AND "student_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "public"."workout_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workout_templates_select" ON "public"."workout_templates" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
CREATE POLICY "workout_templates_insert" ON "public"."workout_templates" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
CREATE POLICY "workout_templates_update" ON "public"."workout_templates" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
CREATE POLICY "workout_templates_delete" ON "public"."workout_templates" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
ALTER TABLE "public"."student_workouts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "student_workouts_select" ON "public"."student_workouts" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
CREATE POLICY "student_workouts_insert" ON "public"."student_workouts" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
CREATE POLICY "student_workouts_update" ON "public"."student_workouts" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
CREATE POLICY "student_workouts_delete" ON "public"."student_workouts" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));
