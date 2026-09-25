-- Papéis: só quem é membro de versatil_platform liga o bypass de RLS.
-- O migrador atual recebe o papel para não derrubar o ambiente no meio da migração.
-- Antes de produção, REVOGUE esse papel do login da aplicação e use PLATFORM_DATABASE_URL.
-- Ver DEPLOY.md.

DO $$ BEGIN
  CREATE ROLE versatil_platform NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE ROLE versatil_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

GRANT versatil_platform TO CURRENT_USER;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app"."is_bypass_rls"() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'true'
    AND pg_has_role(current_user, 'versatil_platform', 'MEMBER');
$$;--> statement-breakpoint

ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_admins" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "platform_admins_platform" ON "platform_admins";--> statement-breakpoint
CREATE POLICY "platform_admins_platform" ON "platform_admins"
  FOR ALL
  USING (pg_has_role(current_user, 'versatil_platform', 'MEMBER'))
  WITH CHECK (pg_has_role(current_user, 'versatil_platform', 'MEMBER'));--> statement-breakpoint

REVOKE ALL ON TABLE "platform_admins" FROM versatil_app;--> statement-breakpoint

ALTER TABLE "tenant_users" ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 1;
