-- Logins da aplicação e dos crons.
-- Quem executa: o mesmo login que aplicou as migrations. Não use runtime nem jobs.
--
--   psql "$DATABASE_URL" -v runtime_password=... -v jobs_password=... -f scripts/provision-db-roles.sql
--
-- Um dump não recria papéis globais. Em servidor novo: migrations e este script
-- antes de apontar a aplicação para o banco restaurado.
-- Tabela nova só de plataforma: na migration, REVOKE ALL FROM versatil_app
-- e GRANT para versatil_platform. O default privilege entrega DML em public
-- aos dois grupos para objetos criados por este mesmo login.

\if :{?runtime_password}
\else
\echo 'Defina -v runtime_password=...'
\quit 1
\endif

\if :{?jobs_password}
\else
\echo 'Defina -v jobs_password=...'
\quit 1
\endif

SELECT format(
  'CREATE ROLE versatil_runtime LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'versatil_runtime')
\gexec

SELECT format(
  'CREATE ROLE versatil_jobs LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS',
  :'jobs_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'versatil_jobs')
\gexec

GRANT versatil_app TO versatil_runtime;
GRANT versatil_platform TO versatil_jobs;
REVOKE versatil_platform FROM versatil_runtime;

-- Repete a 0018. pg_restore --no-acl não traz GRANT nem papéis globais.
GRANT USAGE ON SCHEMA public, app TO versatil_platform;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO versatil_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO versatil_platform;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO versatil_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO versatil_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO versatil_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO versatil_platform;

SELECT format(
  'GRANT CONNECT ON DATABASE %I TO versatil_app, versatil_platform',
  current_database()
)
\gexec

GRANT USAGE ON SCHEMA public, app TO versatil_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO versatil_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO versatil_runtime;
REVOKE ALL ON TABLE platform_admins, cron_runs FROM versatil_runtime;

ALTER ROLE versatil_runtime WITH LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOBYPASSRLS;
ALTER ROLE versatil_jobs WITH LOGIN PASSWORD :'jobs_password' NOSUPERUSER NOBYPASSRLS;
