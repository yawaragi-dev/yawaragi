-- Other names a sake or a brewery is sold under (#413, design v1.7 E1/E2):
-- an export or importer name ("Wandering Poet" for 李白), another reading of
-- the kanji, the brewery's own spelling. Sakenowa publishes one Japanese name
-- per row, and our Latin name is a machine reading of it, so a visitor holding
-- an export label or menu could not find the sake.
--
-- Curated only, with a source on every row (CLAUDE.md "Source provenance";
-- `manual_curation`). Search matches a whole alias, never one of its words,
-- and ranks a hit on an alias below a hit on the name; the row says which
-- name matched ("Also sold as …"). The scan treats an alias like a Latin
-- name: never a sure match on its own.
--
-- Public catalogue data with no user identifier (ADR-0011 does not apply).
-- The app reads it through pg-direct `publicQuery` only, so it follows
-- `name_romaji_overrides`: RLS on, no grant, no policy for anon/authenticated.

CREATE TABLE name_aliases (
  kind        TEXT        NOT NULL CHECK (kind IN ('brand', 'brewery')),
  id          INTEGER     NOT NULL,
  alias       TEXT        NOT NULL CHECK (length(btrim(alias)) > 0),
  alias_type  TEXT        NOT NULL CHECK (alias_type IN ('reading', 'official_spelling', 'export_name', 'importer_spelling')),
  source      TEXT        NOT NULL DEFAULT 'manual_curation' CHECK (source IN ('manual_curation')),
  -- Where the name is printed. Null only when the source is a bottle in the
  -- maintainer's hands, which `note` then names.
  source_url  TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id, alias)
);

ALTER TABLE name_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON name_aliases FROM anon;
REVOKE ALL ON name_aliases FROM authenticated;

-- The first rows, each checked against its source on 2026-10-20.
INSERT INTO name_aliases (kind, id, alias, alias_type, source_url, note) VALUES
  ('brand', 846,  'Wandering Poet', 'export_name', 'https://www.tippsysake.com/products/rihaku-wandering-poet',
   '李白 junmai ginjo, sold abroad as Rihaku "Wandering Poet"; also on the maintainer''s bottle (eval photo rihaku_wandering_poet_clear.jpg)'),
  ('brand', 846,  'Dreamy Clouds',  'export_name', 'https://www.vineconnections.com/japanese-sake/grades/nigori/dreamy-clouds/',
   '李白 tokubetsu junmai nigori, US importer Vine Connections; also on the maintainer''s bottle (rihaku_dreamy_clouds_label.jpg)'),
  ('brand', 793,  'Sugi Barrel',    'export_name', 'https://shop.homu.ch/en/produkte/kueche-17/sake-bier-192/hanatomoe-sugi-barrel-300ml-10944',
   '花巴 taru junmai (the label''s big characters are 樽丸); Swiss shop listing and the maintainer''s bottle (hanatomoe_sugi_barrel_label.jpg)'),
  ('brand', 769,  'Kobe Classic',   'export_name', NULL,
   '福寿 junmai ginjo "Kobe Classic", 300 ml: printed on the maintainer''s bottle (eval photo fukuju_kobe_classic_label.jpg); no web listing found'),
  ('brand', 3776, 'Ichiaji',        'official_spelling', 'https://www.mizuo.co.jp/english/',
   '水尾 一味: the brewery writes "Mizuo Ichiaji" on its English and German pages; the dictionary reading "Ichimi" is wrong for this product');
