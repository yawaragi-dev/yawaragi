-- Which Sakenowa flavor tags each sake carries (#451, design v1.8 M3): a
-- flavor word typed in Search ("grapefruit") lists the sakes Sakenowa
-- drinkers tagged that way (グレープフルーツ). Mirrors Sakenowa's
-- `GET /brand-flavor-tags` (https://muro.sakenowa.com/sakenowa-data), whose
-- rows are `{ brandId, tagIds: [...] }` with up to 20 ordered tag ids.
--
-- Latest snapshot only, like `rankings` (ADR-0002): `pnpm ingest` replaces
-- the table wholesale inside a transaction, so there is no content hash.
-- `position` keeps Sakenowa's order (1-based); the app does not rank by it.
--
-- Public catalogue data with no user identifier (ADR-0011 does not apply).
-- The app reads it through pg-direct `publicQuery` only, so it follows
-- `name_aliases`: RLS on, no grant, no policy for anon/authenticated.
--
-- The app degrades to "no flavor-word results" while this table is missing
-- or empty, so the code may ship before `pnpm migrate` and `pnpm ingest`.

CREATE TABLE brand_flavor_tags (
  brand_id   INTEGER           NOT NULL REFERENCES brands (brand_id) ON DELETE CASCADE,
  tag_id     INTEGER           NOT NULL REFERENCES flavor_tags (tag_id) ON DELETE CASCADE,
  position   SMALLINT          NOT NULL CHECK (position > 0),
  source     provenance_source NOT NULL DEFAULT 'sakenowa' CHECK (source = 'sakenowa'),
  PRIMARY KEY (brand_id, tag_id)
);

-- Search reads by tag ("every sake tagged 109"); the primary key covers the
-- other direction.
CREATE INDEX brand_flavor_tags_tag_id_idx ON brand_flavor_tags (tag_id);

ALTER TABLE brand_flavor_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_flavor_tags FROM anon;
REVOKE ALL ON brand_flavor_tags FROM authenticated;
