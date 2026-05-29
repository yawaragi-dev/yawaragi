-- Areas table — mirrors src/lib/schemas/area.ts.
-- area_id is Sakenowa's id; same PK convention as brands.brand_id.
--
-- area_id 0 is Sakenowa's "Other" sentinel — non-Japanese producers
-- (Taiwan, Korean breweries, etc.) that don't fit the 47-prefecture
-- scheme. We seed it as a real row below so any future
-- breweries.area_id FK (deferred to a follow-up; see PR notes) doesn't
-- choke on the sentinel. Provenance is `manual_curation` because the
-- row is hand-stamped here, not pulled from Sakenowa's /areas envelope.
CREATE TABLE areas (
  area_id      INTEGER          PRIMARY KEY CHECK (area_id >= 0),
  name         TEXT             NOT NULL    CHECK (length(name) > 0),
  source       provenance_source NOT NULL,
  confidence   NUMERIC(3, 2)               CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  content_hash TEXT             NOT NULL,
  updated_at   TIMESTAMPTZ      NOT NULL    DEFAULT NOW()
);

-- Seed the sentinel. content_hash is a deterministic literal so that an
-- ingest-time recompute against the same canonical form matches and the
-- row classifies as "unchanged" rather than churning.
INSERT INTO areas (area_id, name, source, content_hash)
VALUES (0, 'Foreign producer (Sakenowa marker)', 'manual_curation', 'seed-area-0');

-- RLS — public-read reference data (same posture as brands / breweries).
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON areas TO anon;
GRANT SELECT ON areas TO authenticated;

CREATE POLICY areas_anon_select
  ON areas
  FOR SELECT
  TO anon, authenticated
  USING (true);
