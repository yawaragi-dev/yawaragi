-- 長龍 is Choryo: the importer's label prints "CHORYO" and the brewery's own
-- site is choryo.jp. The 2026-10-12 regeneration read it "Choryu", which the
-- scan eval caught — a back label naming CHORYO stopped matching.

INSERT INTO name_romaji_overrides (kind, id, name_romaji, note) VALUES
  ('brand', 797, 'Choryo', '長龍: a regeneration read "Choryu"; the label prints CHORYO');

UPDATE brands SET name_romaji = name_romaji WHERE brand_id IN (797);
