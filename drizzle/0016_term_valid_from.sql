ALTER TABLE "subscription_terms" ADD COLUMN IF NOT EXISTS "valid_from" timestamptz;--> statement-breakpoint
UPDATE "subscription_terms"
SET "valid_from" = "created_at"
WHERE "source" = 'migration' AND "valid_from" IS NULL;--> statement-breakpoint
UPDATE "subscription_terms"
SET "valid_from" = "starts_at"
WHERE "source" <> 'migration' AND "valid_from" IS NULL;--> statement-breakpoint
ALTER TABLE "subscription_terms" ALTER COLUMN "valid_from" SET NOT NULL;
