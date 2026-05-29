-- Provenance source enum — mirrors src/lib/schemas/with-provenance.ts.
-- Keep in sync with the Zod ProvenanceSource enum across schema changes.
CREATE TYPE provenance_source AS ENUM (
  'sakenowa',
  'sakenowa_inferred',
  'llm_extracted',
  'llm_inferred',
  'cross_beverage_map',
  'user_corrected',
  'manual_curation'
);

-- Brands table — mirrors src/lib/schemas/brand.ts.
-- brand_id is Sakenowa's id; we keep it as the PK so joins and lookups are stable.
CREATE TABLE brands (
  brand_id     INTEGER          PRIMARY KEY CHECK (brand_id > 0),
  name         TEXT             NOT NULL    CHECK (length(name) > 0),
  name_kanji   TEXT             NOT NULL    CHECK (length(name_kanji) > 0),
  brewery_id   INTEGER          NOT NULL    CHECK (brewery_id > 0),
  source       provenance_source NOT NULL,
  confidence   NUMERIC(3, 2)               CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  content_hash TEXT             NOT NULL,
  updated_at   TIMESTAMPTZ      NOT NULL    DEFAULT NOW()
);

-- Idempotency fast-path: ingestion compares Sakenowa-row content hashes
-- against this index to skip unchanged rows without re-parsing.
CREATE INDEX brands_content_hash_idx ON brands (content_hash);

-- Brewery FK lookup helper; Slice 5 will add breweries table + a real FK.
CREATE INDEX brands_brewery_id_idx ON brands (brewery_id);

-- Row-Level Security. Phase 2 reference data is public-readable; only the
-- service_role and the migration owner can write. RLS is forward-looking
-- defense-in-depth — Phase 2 has no client-side data path yet, but any
-- future supabase-js anon connection will inherit these policies.
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON brands TO anon;
GRANT SELECT ON brands TO authenticated;

CREATE POLICY brands_anon_select
  ON brands
  FOR SELECT
  TO anon, authenticated
  USING (true);
