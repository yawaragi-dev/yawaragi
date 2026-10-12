-- 松緑酒造 (Hirosaki, Aomori) reads Matsumidori. The original
-- transliteration had "Matsuryoku" and the 2026-10-12 regeneration
-- "Shoroku"; the maintainer confirmed Matsumidori.

INSERT INTO name_romaji_overrides (kind, id, name_romaji, note) VALUES
  ('brewery', 13, 'Matsumidori Shuzo', '松緑酒造: a regeneration read "Shoroku"; the brewery is Matsumidori');

UPDATE breweries SET name_romaji = name_romaji WHERE brewery_id IN (13);
