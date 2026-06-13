-- Manual-curation extension layer (ADR-0014).
--
-- Two changes that together let maintainers seed brands + breweries
-- the Sakenowa Data API is missing (collaboration / limited-edition
-- bottles like UMAMI; everything added after Sakenowa's 2024-03-21
-- dump freeze) without colliding with the upstream namespace and
-- without losing track when Sakenowa eventually catches up.
--
-- 1. `superseded_at TIMESTAMPTZ NULL` on brands + breweries.
--    Default NULL = live. When ingest detects that a freshly-
--    published Sakenowa row matches a manual_curation row on
--    `(name_kanji, brewery_id)` (i.e. Sakenowa has finally
--    published what we hand-added), the operator confirms the
--    supersede via `pnpm ingest -- --supersede-confirmed` and the
--    manual row's `superseded_at` flips to the run's timestamp.
--    Read-side queries filter `superseded_at IS NULL` so the
--    manual row disappears from the lookup chain but the audit
--    trail survives.
--
-- 2. Range-partition CHECK constraint on the brand_id / brewery_id
--    PKs. Sakenowa-sourced rows (`source IN ('sakenowa',
--    'sakenowa_inferred')`) must use IDs in the upstream range
--    (`< 1_000_000`). Manual rows (`source = 'manual_curation'`)
--    must use IDs in the reserved high range (`>= 9_000_000`).
--    Current Sakenowa max is ~79k brands / ~1.9k breweries — 1M
--    is 12x headroom for them and 8M of clear space for us.
--    Prevents the worst-case "Sakenowa publishes brand_id 9000001
--    and ingest overwrites our UMAMI override" by making it
--    schema-enforced impossible.
--
-- `user_corrected` rows are intentionally NOT constrained — they
-- patch existing rows and inherit whatever ID range the patched
-- row sits in.

ALTER TABLE brands    ADD COLUMN superseded_at TIMESTAMPTZ NULL;
ALTER TABLE breweries ADD COLUMN superseded_at TIMESTAMPTZ NULL;

-- Partial indexes: most rows will have superseded_at IS NULL
-- forever. The partial form keeps the live-row index small.
CREATE INDEX brands_live_idx
  ON brands (brand_id)
  WHERE superseded_at IS NULL;

CREATE INDEX breweries_live_idx
  ON breweries (brewery_id)
  WHERE superseded_at IS NULL;

-- Range partition. Permissive intentionally: only enforces the
-- two "must hold" cases; sources that don't match either clause
-- (e.g. `user_corrected`) pass through.
ALTER TABLE brands
  ADD CONSTRAINT brands_id_namespace_chk
  CHECK (
    (source IN ('sakenowa', 'sakenowa_inferred') AND brand_id < 1000000)
    OR (source = 'manual_curation' AND brand_id >= 9000000)
    OR (source NOT IN ('sakenowa', 'sakenowa_inferred', 'manual_curation'))
  );

ALTER TABLE breweries
  ADD CONSTRAINT breweries_id_namespace_chk
  CHECK (
    (source IN ('sakenowa', 'sakenowa_inferred') AND brewery_id < 1000000)
    OR (source = 'manual_curation' AND brewery_id >= 9000000)
    OR (source NOT IN ('sakenowa', 'sakenowa_inferred', 'manual_curation'))
  );
