CREATE TABLE IF NOT EXISTS cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job varchar(64) NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error varchar(500)
);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_runs_platform ON cron_runs;
CREATE POLICY cron_runs_platform ON cron_runs
  FOR ALL
  USING (app.is_bypass_rls())
  WITH CHECK (app.is_bypass_rls());

REVOKE ALL ON cron_runs FROM PUBLIC;
REVOKE ALL ON cron_runs FROM versatil_app;
GRANT SELECT, INSERT ON cron_runs TO versatil_platform;
