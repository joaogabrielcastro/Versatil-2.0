-- Remove o valor 'asaas' do enum payment_gateway (não usado no Plano C).
-- Postgres não suporta DROP VALUE; recria o tipo sem 'asaas'.

-- Garante que nenhuma linha use 'asaas' antes da conversão.
UPDATE "tenant_payment_settings" SET "gateway" = 'stripe' WHERE "gateway" = 'asaas';--> statement-breakpoint

ALTER TYPE "public"."payment_gateway" RENAME TO "payment_gateway_old";--> statement-breakpoint
CREATE TYPE "public"."payment_gateway" AS ENUM('stripe');--> statement-breakpoint
ALTER TABLE "tenant_payment_settings"
  ALTER COLUMN "gateway" TYPE "public"."payment_gateway"
  USING ("gateway"::text::"public"."payment_gateway");--> statement-breakpoint
DROP TYPE "public"."payment_gateway_old";
