-- Three more curated readings, found by the real-bottle scan eval (#110):
-- each is printed in Latin on the bottle, and the model's transliteration
-- disagreed, so a back label read correctly could not be matched.

INSERT INTO name_romaji_overrides (kind, id, name_romaji, note) VALUES
  ('brand',   1123, 'Kurokabuto', '黒兜: model read "Kurogane"; the label prints the reading くろかぶと'),
  ('brewery', 224,  'Nabedana',   '鍋店: model read "Nabeya"; the importer label and the brewery write Nabedana'),
  ('brewery', 61,   'Hokushika',  '北鹿: model read "Kitashika"; the label prints HOKUSHIKA');

-- Apply them to the rows already in the mirror, as 0013 does.
UPDATE brands    SET name_romaji = name_romaji WHERE brand_id   IN (1123);
UPDATE breweries SET name_romaji = name_romaji WHERE brewery_id IN (224, 61);
