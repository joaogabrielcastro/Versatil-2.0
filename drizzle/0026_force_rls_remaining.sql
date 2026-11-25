-- FORCE RLS nas tabelas criadas depois da 0010. Sem isso o dono das tabelas
-- (login das migrations, ou o usuário padrão do docker-compose) ignora as
-- policies. Não altera dados nem policies.
ALTER TABLE "class_activities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_slots" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_access_grants" FORCE ROW LEVEL SECURITY;
