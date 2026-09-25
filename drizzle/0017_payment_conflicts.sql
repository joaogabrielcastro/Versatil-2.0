CREATE TABLE IF NOT EXISTS "payment_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE cascade,
  "charge_id" varchar(255) NOT NULL,
  "event_id" varchar(255) NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenant_id", "invoice_id", "charge_id")
);--> statement-breakpoint
ALTER TABLE "payment_conflicts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_conflicts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_conflicts_all" ON "payment_conflicts";--> statement-breakpoint
CREATE POLICY "payment_conflicts_all" ON "payment_conflicts"
  FOR ALL USING ("app"."tenant_row_ok"("tenant_id"))
  WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
GRANT SELECT, INSERT ON "payment_conflicts" TO versatil_app;
