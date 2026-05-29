-- Ingestion telemetry. One row per `pnpm ingest` (or cron) invocation,
-- success or failure. Consumed by issue #54's cron route and operator
-- dashboards; never user-facing.
--
-- Service-role-only on purpose. The bootstrap defaults grant anon
-- SELECT on every new public table, so we explicitly REVOKE that grant
-- and never CREATE POLICY for anon — RLS-on + no policy + no grant
-- means anon cannot read the table at all. service_role bypasses RLS.
--
-- gen_random_uuid() is built into PostgreSQL 13+ so no extension is
-- needed (Supabase's PG is 15+).
CREATE TABLE ingestion_runs (
  run_id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at           TIMESTAMPTZ  NOT NULL,
  finished_at          TIMESTAMPTZ  NOT NULL,
  status               TEXT         NOT NULL CHECK (status IN ('success', 'failed')),
  per_table            JSONB        NOT NULL,
  source_revision_hash TEXT         NOT NULL CHECK (length(source_revision_hash) > 0),
  error_message        TEXT
);

-- Common access pattern: "most recent run" for dashboards / cron skip
-- decisions.
CREATE INDEX ingestion_runs_started_at_idx ON ingestion_runs (started_at DESC);

ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;

REVOKE SELECT ON ingestion_runs FROM anon;
REVOKE SELECT ON ingestion_runs FROM authenticated;
REVOKE ALL    ON ingestion_runs FROM anon;
REVOKE ALL    ON ingestion_runs FROM authenticated;

GRANT ALL ON ingestion_runs TO service_role;
