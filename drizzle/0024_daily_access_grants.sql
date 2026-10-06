-- Autorização de um dia civil: aula avulsa CrossFit ou day use gratuito.
-- Não cria assinatura. A data vale no fuso America/Sao_Paulo e expira sozinha.
-- Faturas antigas de aula avulsa não são convertidas aqui.
CREATE TABLE "daily_access_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "kind" varchar(32) NOT NULL,
  "activity_code" varchar(32) NOT NULL,
  "valid_on" date NOT NULL,
  "invoice_id" uuid,
  "status" varchar(16) NOT NULL,
  "cancel_reason" varchar(500),
  "cancelled_at" timestamp with time zone,
  "granted_by" uuid,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "idempotency_key" varchar(160) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "daily_access_grants" ADD CONSTRAINT "daily_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daily_access_grants" ADD CONSTRAINT "daily_access_grants_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daily_access_grants" ADD CONSTRAINT "daily_access_grants_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "daily_access_grants" ADD CONSTRAINT "daily_access_grants_granted_by_tenant_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "tenant_users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "daily_access_grants" ADD CONSTRAINT "daily_access_grants_kind_check" CHECK ("kind" IN ('crossfit_drop_in', 'day_use'));
ALTER TABLE "daily_access_grants" ADD CONSTRAINT "daily_access_grants_status_check" CHECK ("status" IN ('pending', 'active', 'cancelled'));
ALTER TABLE "daily_access_grants" ADD CONSTRAINT "daily_access_grants_shape_check" CHECK (
  ("kind" = 'crossfit_drop_in' AND "activity_code" = 'crossfit' AND "invoice_id" IS NOT NULL)
  OR ("kind" = 'day_use' AND "activity_code" = 'musculacao' AND "invoice_id" IS NULL)
);
ALTER TABLE "daily_access_grants" ADD CONSTRAINT "daily_access_grants_cancel_check" CHECK (
  ("status" = 'cancelled' AND "cancel_reason" IS NOT NULL AND "cancelled_at" IS NOT NULL)
  OR ("status" <> 'cancelled' AND "cancel_reason" IS NULL AND "cancelled_at" IS NULL)
);

CREATE UNIQUE INDEX "daily_access_grants_tenant_key" ON "daily_access_grants" ("tenant_id", "idempotency_key");
CREATE UNIQUE INDEX "daily_access_grants_tenant_invoice" ON "daily_access_grants" ("tenant_id", "invoice_id") WHERE "invoice_id" IS NOT NULL;
CREATE UNIQUE INDEX "daily_access_grants_day_use_once" ON "daily_access_grants" ("tenant_id", "student_id") WHERE "kind" = 'day_use';
CREATE INDEX "daily_access_grants_student_idx" ON "daily_access_grants" ("tenant_id", "student_id", "valid_on");

ALTER TABLE "daily_access_grants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_access_grants_select" ON "daily_access_grants" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "daily_access_grants_insert" ON "daily_access_grants" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "daily_access_grants_update" ON "daily_access_grants" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "daily_access_grants_delete" ON "daily_access_grants" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));
