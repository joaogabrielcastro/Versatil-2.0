-- Fase 1b: renovação automática (cartão salvo) + controle de tentativas de cobrança.
ALTER TABLE "student_subscriptions"
  ADD COLUMN IF NOT EXISTS "auto_renew" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "provider" varchar(32),
  ADD COLUMN IF NOT EXISTS "external_customer_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "external_card_id" varchar(255);--> statement-breakpoint

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "charge_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "next_charge_attempt_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "last_charge_error" text;
