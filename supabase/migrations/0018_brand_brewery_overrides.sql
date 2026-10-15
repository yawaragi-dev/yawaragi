-- Hand-curated brewery for a sake Sakenowa files under the wrong one
-- (#416, #419). The same shape as `name_romaji_overrides` (0013): a
-- BEFORE INSERT OR UPDATE trigger on `brands` sets the curated
-- `brewery_id` on every write, so the ingest keeps upserting what Sakenowa
-- publishes and never needs to know, and a later ingest cannot undo it.
-- Keyed by Sakenowa's brand id; if Sakenowa fixes the row, the curator
-- removes the override.
--
-- Two kinds of wrong it covers:
--   - a sake under a different brewery of a near-identical name (水尾 under
--     田中酒造店, where the label and the maker's site say 田中屋酒造店, a row
--     Sakenowa has with no sakes);
--   - a sake under a prefecture's placeholder row (an empty-named brewery,
--     Sakenowa's "maker not on record") whose maker the label prints and the
--     catalogue has (倶知安 → 二世古酒造).
--
-- Public catalogue data with no user identifier (ADR-0011 does not apply).
-- Only the trigger reads it: RLS on, no grant, as `name_romaji_overrides`.

CREATE TABLE brand_brewery_overrides (
  brand_id    INTEGER     PRIMARY KEY CHECK (brand_id > 0),
  brewery_id  INTEGER     NOT NULL CHECK (brewery_id > 0),
  -- Where the right brewery comes from (the label, the maker's site).
  -- Curation notes, not displayed.
  note        TEXT        NOT NULL CHECK (length(btrim(note)) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE brand_brewery_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_brewery_overrides FROM anon;
REVOKE ALL ON brand_brewery_overrides FROM authenticated;

CREATE FUNCTION apply_brand_brewery_override() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  curated INTEGER;
BEGIN
  SELECT o.brewery_id INTO curated
    FROM brand_brewery_overrides o
   WHERE o.brand_id = NEW.brand_id;
  -- Only onto a brewery the mirror holds: a curated id that is not (yet)
  -- there would leave the sake with no brewery at all.
  IF FOUND AND EXISTS (SELECT 1 FROM breweries w WHERE w.brewery_id = curated) THEN
    NEW.brewery_id := curated;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER brands_brewery_override
  BEFORE INSERT OR UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION apply_brand_brewery_override();

INSERT INTO brand_brewery_overrides (brand_id, brewery_id, note) VALUES
  (3776, 1746, '水尾: Sakenowa files it under 1357 田中酒造店 (Nagano); the label and mizuo.co.jp say 田中屋酒造店 (Tanakaya), Sakenowa 1746, same prefecture, no sakes of its own (#416)'),
  (4109, 923,  '倶知安: under Hokkaidō''s placeholder 784; the label prints 二世古酒造, Sakenowa 923 (#419)');

-- Apply to the rows already in the mirror; a no-op UPDATE fires the trigger.
UPDATE brands SET brewery_id = brewery_id WHERE brand_id IN (SELECT brand_id FROM brand_brewery_overrides);
