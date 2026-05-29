-- Breweries table — mirrors src/lib/schemas/brewery.ts.
-- brewery_id is Sakenowa's id; same PK convention as brands.brand_id.
-- area_id is forward-looking — slice 9 adds the areas table + an FK; this slice
-- ingests the value so no follow-up column-add migration is needed.
CREATE TABLE breweries (
  brewery_id   INTEGER          PRIMARY KEY CHECK (brewery_id > 0),
  name         TEXT             NOT NULL    CHECK (length(name) > 0),
  name_kanji   TEXT             NOT NULL    CHECK (length(name_kanji) > 0),
  area_id      INTEGER          NOT NULL    CHECK (area_id > 0),
  source       provenance_source NOT NULL,
  confidence   NUMERIC(3, 2)               CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  content_hash TEXT             NOT NULL,
  updated_at   TIMESTAMPTZ      NOT NULL    DEFAULT NOW()
);

CREATE INDEX breweries_content_hash_idx ON breweries (content_hash);
CREATE INDEX breweries_area_id_idx      ON breweries (area_id);

-- Now that breweries exists, promote the forward-looking brewery_id column on
-- brands into a real FK. The CHECK + index from 0001_brands.sql stays in
-- place; the FK adds referential integrity on top.
ALTER TABLE brands
  ADD CONSTRAINT brands_brewery_id_fkey
    FOREIGN KEY (brewery_id) REFERENCES breweries (brewery_id);

-- RLS — public-read reference data (same posture as brands).
ALTER TABLE breweries ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON breweries TO anon;
GRANT SELECT ON breweries TO authenticated;

CREATE POLICY breweries_anon_select
  ON breweries
  FOR SELECT
  TO anon, authenticated
  USING (true);
