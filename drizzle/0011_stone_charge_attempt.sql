ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "gateway_idempotency_key" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "reconcile_attempts" integer DEFAULT 0 NOT NULL;
