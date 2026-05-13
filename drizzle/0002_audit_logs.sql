CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(96) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" varchar(64),
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_tenant_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."tenant_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_logs_select" ON "audit_logs" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
CREATE POLICY "audit_logs_insert" ON "audit_logs" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
CREATE POLICY "audit_logs_update" ON "audit_logs" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
--> statement-breakpoint
CREATE POLICY "audit_logs_delete" ON "audit_logs" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));
