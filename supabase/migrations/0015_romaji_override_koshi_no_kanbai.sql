-- One more curated reading from a label (#407's shop photos): the importer's
-- neck sticker prints KOSHI NO KANBAI, and a search for it found nothing.

INSERT INTO name_romaji_overrides (kind, id, name_romaji, note) VALUES
  ('brand', 384, 'Koshi no Kanbai', '越乃寒梅: model read "Koshino Kanume"; the label prints KOSHI NO KANBAI');

UPDATE brands SET name_romaji = name_romaji WHERE brand_id IN (384);
