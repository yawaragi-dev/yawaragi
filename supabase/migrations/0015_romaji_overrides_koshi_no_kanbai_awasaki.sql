-- Two more curated readings from labels (#407's shop photos): the importer's
-- neck sticker prints KOSHI NO KANBAI, and a search for it found nothing.

INSERT INTO name_romaji_overrides (kind, id, name_romaji, note) VALUES
  ('brand', 384,  'Koshi no Kanbai', '越乃寒梅: model read "Koshino Kanume"; the label prints KOSHI NO KANBAI'),
  -- Right in the mirror today; pinned because a regeneration with a newer
  -- model voiced it ("Awazaki"), and the label prints AWASAKI.
  ('brand', 3434, 'Awasaki',         'あわ咲き: the label prints AWASAKI; a regeneration read "Awazaki"');

UPDATE brands SET name_romaji = name_romaji WHERE brand_id IN (384, 3434);
