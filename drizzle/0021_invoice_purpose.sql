ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "purpose" varchar(32);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purpose_check" CHECK ("purpose" IS NULL OR "purpose" IN ('subscription', 'fee', 'manual'));
