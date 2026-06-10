-- Romaji name columns for brands + breweries. Sakenowa publishes only
-- Japanese names; the romaji is editorial / LLM-derived (see CONTEXT.md
-- "Naming convention" and ADR-0005). Nullable on purpose: a freshly-
-- ingested row whose transliteration hasn't completed yet is visibly
-- distinct from one whose transliteration came back empty.
--
-- Convention: name_romaji is mixed-case display form, never an
-- identifier. Joins still go through `name_kanji` (CONTEXT.md
-- "Same-romaji collisions are possible across Breweries and Sakes").
--
-- See issue #121 for the population pipeline. The column lands here
-- so a fresh DB created from migrations is forward-compatible even
-- if `pnpm ingest` hasn't run yet.

ALTER TABLE brands    ADD COLUMN name_romaji TEXT;
ALTER TABLE breweries ADD COLUMN name_romaji TEXT;

-- Partial indexes: search on romaji only matters once it's populated.
-- A regular B-tree index on a column that's NULL for many rows wastes
-- space; the partial form skips the NULL entries.
CREATE INDEX brands_name_romaji_idx
  ON brands (name_romaji)
  WHERE name_romaji IS NOT NULL;

CREATE INDEX breweries_name_romaji_idx
  ON breweries (name_romaji)
  WHERE name_romaji IS NOT NULL;
