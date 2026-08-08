-- Config multi-provider de pagamento por tenant (Fase 1: Pagar.me).
CREATE TABLE IF NOT EXISTS "payment_provider_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider" varchar(32) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "encrypted_credentials" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_configs_tenant_provider"
  ON "payment_provider_configs" ("tenant_id", "provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_provider_configs_tenant_idx"
  ON "payment_provider_configs" ("tenant_id");--> statement-breakpoint

-- RLS por tenant (mesmo padrão das demais tabelas).
ALTER TABLE "payment_provider_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_provider_configs_select" ON "payment_provider_configs" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "payment_provider_configs_insert" ON "payment_provider_configs" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "payment_provider_configs_update" ON "payment_provider_configs" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "payment_provider_configs_delete" ON "payment_provider_configs" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));
