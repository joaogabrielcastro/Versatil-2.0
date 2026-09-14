-- Fase 1: FORCE RLS, kiosk por tenant, estados de webhook/cobrança, CPF só dígitos.

-- Token de terminal de treino por academia (não usar secret global).
CREATE TABLE IF NOT EXISTS "kiosk_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "last_seen_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "kiosk_devices_token_hash" ON "kiosk_devices" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kiosk_devices_tenant_idx" ON "kiosk_devices" ("tenant_id");--> statement-breakpoint

ALTER TABLE "kiosk_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kiosk_devices_select" ON "kiosk_devices" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "kiosk_devices_insert" ON "kiosk_devices" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "kiosk_devices_update" ON "kiosk_devices" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "kiosk_devices_delete" ON "kiosk_devices" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "gateway_charge_status" varchar(32) NOT NULL DEFAULT 'idle';--> statement-breakpoint

ALTER TABLE "webhook_dedupe" ADD COLUMN IF NOT EXISTS "status" varchar(32) NOT NULL DEFAULT 'processed';--> statement-breakpoint
ALTER TABLE "webhook_dedupe" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "webhook_dedupe" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint
ALTER TABLE "webhook_dedupe" ALTER COLUMN "processed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_dedupe" ALTER COLUMN "status" SET DEFAULT 'received';--> statement-breakpoint

-- CPF persistido apenas com dígitos (evita colisão de unique quando possível).
UPDATE "students" AS s
SET "cpf" = regexp_replace(s."cpf", '[^0-9]', '', 'g')
WHERE s."cpf" ~ '[^0-9]'
  AND NOT EXISTS (
    SELECT 1
    FROM "students" AS o
    WHERE o."tenant_id" = s."tenant_id"
      AND o."id" <> s."id"
      AND regexp_replace(o."cpf", '[^0-9]', '', 'g') = regexp_replace(s."cpf", '[^0-9]', '', 'g')
  );--> statement-breakpoint

-- FORCE RLS: o owner da tabela (user `app`) passa a respeitar as policies.
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_timeline_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_payment_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_provider_configs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "turnstile_devices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "import_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_dedupe" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workout_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_workouts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kiosk_devices" FORCE ROW LEVEL SECURITY;
