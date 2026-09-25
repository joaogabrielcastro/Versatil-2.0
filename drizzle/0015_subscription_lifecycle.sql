ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "price_cents" integer;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "billing_interval" varchar(32);--> statement-breakpoint
UPDATE "student_subscriptions" AS s
SET "price_cents" = p."price_cents",
    "billing_interval" = p."billing_interval"::text
FROM "plans" AS p
WHERE s."plan_id" = p."id"
  AND s."price_cents" IS NULL;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ALTER COLUMN "price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ALTER COLUMN "billing_interval" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "auto_charge_pos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "student_subscriptions" SET "auto_charge_pos" = "auto_renew" WHERE "auto_charge_pos" = false AND "auto_renew" = true;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamptz;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_effective_at" timestamptz;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "scheduled_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "scheduled_price_cents" integer;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "scheduled_billing_interval" varchar(32);--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD COLUMN IF NOT EXISTS "scheduled_effective_at" timestamptz;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_terms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "subscription_id" uuid NOT NULL REFERENCES "student_subscriptions"("id") ON DELETE cascade,
  "plan_id" uuid NOT NULL REFERENCES "plans"("id") ON DELETE restrict,
  "price_cents" integer NOT NULL,
  "billing_interval" varchar(32) NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz,
  "source" varchar(32) NOT NULL,
  "created_by" uuid,
  "note" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
INSERT INTO "subscription_terms" (
  "tenant_id", "subscription_id", "plan_id", "price_cents", "billing_interval",
  "starts_at", "ends_at", "source", "note"
)
SELECT s."tenant_id", s."id", s."plan_id", s."price_cents", s."billing_interval",
       s."starts_at", s."ends_at", 'migration',
       'Condição vigente na migration. Não reconstrói vigências anteriores.'
FROM "student_subscriptions" AS s
WHERE NOT EXISTS (
  SELECT 1 FROM "subscription_terms" t WHERE t."subscription_id" = s."id"
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "subscription_id" uuid NOT NULL REFERENCES "student_subscriptions"("id") ON DELETE cascade,
  "period_key" varchar(255) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenant_id", "period_key")
);--> statement-breakpoint
ALTER TABLE "subscription_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_terms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_reviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "subscription_terms_all" ON "subscription_terms";--> statement-breakpoint
CREATE POLICY "subscription_terms_all" ON "subscription_terms"
  FOR ALL USING ("app"."tenant_row_ok"("tenant_id"))
  WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
DROP POLICY IF EXISTS "billing_reviews_all" ON "billing_reviews";--> statement-breakpoint
CREATE POLICY "billing_reviews_all" ON "billing_reviews"
  FOR ALL USING ("app"."tenant_row_ok"("tenant_id"))
  WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "subscription_terms", "billing_reviews" TO versatil_app;
