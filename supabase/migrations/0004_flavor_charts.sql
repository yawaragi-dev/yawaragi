-- Flavor charts table — mirrors src/lib/schemas/flavor-chart.ts.
-- Sakenowa's /flavor-charts publishes one row per brand with six axes in
-- [0, 1]. PK on brand_id (one chart per brand); FK to brands so a deleted
-- brand cascades its chart away.
--
-- NUMERIC(5, 4) keeps four decimal digits per axis — Sakenowa publishes
-- ~12 decimals, so storage truncates. Acceptable because (a) display
-- formats to two decimals (.toFixed(2)) and (b) the idempotency hash is
-- computed against the in-memory float before write, so re-runs against
-- unchanged Sakenowa data still produce zero writes.
--
-- Deliberately NO btree index on content_hash. The ingestion pipeline
-- reads existing hashes into a JS Map and compares per-row; no SQL query
-- ever WHEREs on content_hash. See #79 — the same dead index was added
-- to brands and breweries in 0001/0002 and is being dropped.
CREATE TABLE flavor_charts (
  brand_id     INTEGER          PRIMARY KEY REFERENCES brands (brand_id) ON DELETE CASCADE,
  f1           NUMERIC(5, 4)    NOT NULL    CHECK (f1 >= 0 AND f1 <= 1),
  f2           NUMERIC(5, 4)    NOT NULL    CHECK (f2 >= 0 AND f2 <= 1),
  f3           NUMERIC(5, 4)    NOT NULL    CHECK (f3 >= 0 AND f3 <= 1),
  f4           NUMERIC(5, 4)    NOT NULL    CHECK (f4 >= 0 AND f4 <= 1),
  f5           NUMERIC(5, 4)    NOT NULL    CHECK (f5 >= 0 AND f5 <= 1),
  f6           NUMERIC(5, 4)    NOT NULL    CHECK (f6 >= 0 AND f6 <= 1),
  source       provenance_source NOT NULL,
  confidence   NUMERIC(3, 2)               CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  content_hash TEXT             NOT NULL,
  updated_at   TIMESTAMPTZ      NOT NULL    DEFAULT NOW()
);

-- RLS: public-read reference data (same posture as brands / breweries).
ALTER TABLE flavor_charts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON flavor_charts TO anon;
GRANT SELECT ON flavor_charts TO authenticated;

CREATE POLICY flavor_charts_anon_select
  ON flavor_charts
  FOR SELECT
  TO anon, authenticated
  USING (true);
