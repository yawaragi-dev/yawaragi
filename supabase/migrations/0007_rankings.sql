-- Rankings table — mirrors src/lib/schemas/ranking.ts. ADR-0002 fixes
-- the freshness model: we store only the latest snapshot. Ingestion
-- replaces the table wholesale inside a transaction — there is no
-- per-row content-hash idempotency, no historical retention.
--
-- Two kinds:
--   'overall' — Sakenowa's global top list. area_id is NULL.
--   'area'    — per-area top list (includes the foreign-producer
--               sentinel area_id 0). area_id is the scope.
--
-- Uniqueness scope is (kind, area_id, rank). PG treats NULL as distinct
-- in a regular PK / UNIQUE constraint, so we use a UNIQUE INDEX with
-- COALESCE(area_id, -1) instead — that collapses the NULL scope into a
-- single bucket and prevents two 'overall' rows with the same rank from
-- coexisting. -1 is safe because area_id is constrained >= 0.
CREATE TABLE rankings (
  kind         TEXT             NOT NULL CHECK (kind IN ('overall', 'area')),
  area_id      INTEGER                   CHECK (area_id IS NULL OR area_id >= 0),
  rank         INTEGER          NOT NULL CHECK (rank > 0),
  brand_id     INTEGER          NOT NULL REFERENCES brands (brand_id) ON DELETE CASCADE,
  score        NUMERIC          NOT NULL,
  source       provenance_source NOT NULL,
  confidence   NUMERIC(3, 2)             CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  -- Enforce the kind ↔ area_id invariant in SQL too; the Zod schema
  -- enforces the same shape on the way in.
  CONSTRAINT rankings_kind_area_id_consistent CHECK (
    (kind = 'overall' AND area_id IS NULL) OR
    (kind = 'area'    AND area_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX rankings_pk_idx
  ON rankings (kind, COALESCE(area_id, -1), rank);

-- RLS — public-read reference data.
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON rankings TO anon;
GRANT SELECT ON rankings TO authenticated;

CREATE POLICY rankings_anon_select
  ON rankings
  FOR SELECT
  TO anon, authenticated
  USING (true);
