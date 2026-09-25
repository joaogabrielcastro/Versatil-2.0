-- Privilégios do grupo versatil_platform, herdados por versatil_jobs.
-- Quem executa: o login que aplica as migrations (dono dos objetos).
-- Não execute como versatil_runtime nem versatil_jobs.
-- Login com senha continua em scripts/provision-db-roles.sql.

GRANT USAGE ON SCHEMA public, app TO versatil_platform;--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO versatil_platform;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO versatil_platform;--> statement-breakpoint

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO versatil_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO versatil_platform;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO versatil_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO versatil_platform;
