-- Areas table — mirrors src/lib/schemas/area.ts.
-- area_id is Sakenowa's id; same PK convention as brands.brand_id.
--
-- area_id 0 is Sakenowa's "その他" / Other sentinel — non-Japanese
-- producers (Taiwan, Korean breweries, etc.) that don't fit the
-- 47-prefecture scheme. We seed it as a real row below so any future
-- breweries.area_id FK (deferred to a follow-up; see PR notes) doesn't
-- choke on the sentinel.
--
-- Seed values mirror exactly what /areas publishes (name='その他',
-- source='sakenowa') and the content_hash is the deterministic SHA-256
-- the pipeline computes for that canonical shape — so the first
-- `pnpm ingest` reports the row as "unchanged" rather than churning
-- it from a placeholder English label into the published Japanese one.
CREATE TABLE areas (
  area_id      INTEGER          PRIMARY KEY CHECK (area_id >= 0),
  name         TEXT             NOT NULL    CHECK (length(name) > 0),
  source       provenance_source NOT NULL,
  confidence   NUMERIC(3, 2)               CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  content_hash TEXT             NOT NULL,
  updated_at   TIMESTAMPTZ      NOT NULL    DEFAULT NOW()
);

-- Hash recomputed if the canonical shape (areaId/name/source/confidence)
-- ever changes — see computeAreaContentHash in ingestion-pipeline.ts.
INSERT INTO areas (area_id, name, source, content_hash)
VALUES (0, 'その他', 'sakenowa', 'cd6466b27bd622953f446dfb924bdd016e86f44269f1e338a0153372c2c77cc3');

-- RLS — public-read reference data (same posture as brands / breweries).
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON areas TO anon;
GRANT SELECT ON areas TO authenticated;

CREATE POLICY areas_anon_select
  ON areas
  FOR SELECT
  TO anon, authenticated
  USING (true);
