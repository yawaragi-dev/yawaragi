-- Flavor tags table — mirrors src/lib/schemas/flavor-tag.ts. Sakenowa's
-- 117-tag categorical vocabulary (sweet / dry / umami / fruity / etc.).
-- Issue #52 calls these "Types"; CONTEXT.md's domain language calls
-- them FlavorTag. We follow the project's domain language.
CREATE TABLE flavor_tags (
  tag_id       INTEGER          PRIMARY KEY CHECK (tag_id > 0),
  name         TEXT             NOT NULL    CHECK (length(name) > 0),
  source       provenance_source NOT NULL,
  confidence   NUMERIC(3, 2)               CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  content_hash TEXT             NOT NULL,
  updated_at   TIMESTAMPTZ      NOT NULL    DEFAULT NOW()
);

-- RLS — public-read reference data.
ALTER TABLE flavor_tags ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON flavor_tags TO anon;
GRANT SELECT ON flavor_tags TO authenticated;

CREATE POLICY flavor_tags_anon_select
  ON flavor_tags
  FOR SELECT
  TO anon, authenticated
  USING (true);
