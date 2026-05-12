-- Row-Level Security: isolamento por tenant_id + bypass controlado pela aplicação (set_config em transação).

CREATE SCHEMA IF NOT EXISTS "app";

CREATE OR REPLACE FUNCTION "app"."is_bypass_rls"() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'true';
$$;

CREATE OR REPLACE FUNCTION "app"."current_tenant_id"() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(trim(both FROM COALESCE(current_setting('app.tenant_id', true), '')), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION "app"."tenant_row_ok"(tid uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT "app"."is_bypass_rls"()
    OR ("app"."current_tenant_id"() IS NOT NULL AND tid = "app"."current_tenant_id"());
$$;

-- tenants: leitura do próprio tenant ou bypass; escrita apenas com bypass
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select_ctx" ON "tenants" FOR SELECT
  USING ("app"."is_bypass_rls"() OR "id" = "app"."current_tenant_id"());

CREATE POLICY "tenants_insert_bypass" ON "tenants" FOR INSERT
  WITH CHECK ("app"."is_bypass_rls"());

CREATE POLICY "tenants_update_bypass" ON "tenants" FOR UPDATE
  USING ("app"."is_bypass_rls"()) WITH CHECK ("app"."is_bypass_rls"());

CREATE POLICY "tenants_delete_bypass" ON "tenants" FOR DELETE
  USING ("app"."is_bypass_rls"());

-- Tabelas com tenant_id
ALTER TABLE "tenant_users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_users_select" ON "tenant_users" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "tenant_users_insert" ON "tenant_users" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "tenant_users_update" ON "tenant_users" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "tenant_users_delete" ON "tenant_users" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students_select" ON "students" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "students_insert" ON "students" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "students_update" ON "students" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "students_delete" ON "students" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_select" ON "plans" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "plans_insert" ON "plans" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "plans_update" ON "plans" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "plans_delete" ON "plans" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "student_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student_subscriptions_select" ON "student_subscriptions" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "student_subscriptions_insert" ON "student_subscriptions" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "student_subscriptions_update" ON "student_subscriptions" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "student_subscriptions_delete" ON "student_subscriptions" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_select" ON "invoices" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "invoices_insert" ON "invoices" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "invoices_update" ON "invoices" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "invoices_delete" ON "invoices" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "invoice_timeline_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_timeline_events_select" ON "invoice_timeline_events" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "invoice_timeline_events_insert" ON "invoice_timeline_events" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "invoice_timeline_events_update" ON "invoice_timeline_events" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "invoice_timeline_events_delete" ON "invoice_timeline_events" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "tenant_payment_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_payment_settings_select" ON "tenant_payment_settings" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "tenant_payment_settings_insert" ON "tenant_payment_settings" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "tenant_payment_settings_update" ON "tenant_payment_settings" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "tenant_payment_settings_delete" ON "tenant_payment_settings" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "turnstile_devices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "turnstile_devices_select" ON "turnstile_devices" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "turnstile_devices_insert" ON "turnstile_devices" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "turnstile_devices_update" ON "turnstile_devices" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "turnstile_devices_delete" ON "turnstile_devices" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "access_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_events_select" ON "access_events" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "access_events_insert" ON "access_events" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "access_events_update" ON "access_events" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "access_events_delete" ON "access_events" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_jobs_select" ON "import_jobs" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "import_jobs_insert" ON "import_jobs" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "import_jobs_update" ON "import_jobs" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "import_jobs_delete" ON "import_jobs" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));

ALTER TABLE "webhook_dedupe" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_dedupe_select" ON "webhook_dedupe" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "webhook_dedupe_insert" ON "webhook_dedupe" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "webhook_dedupe_update" ON "webhook_dedupe" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));
CREATE POLICY "webhook_dedupe_delete" ON "webhook_dedupe" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));
