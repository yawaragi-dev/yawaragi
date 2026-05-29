-- Relax the breweries CHECK constraints to admit two real Sakenowa
-- conventions that we don't want to drop on the floor:
--
-- (1) ~48 placeholder rows with empty `name` — used as "specific brewery
--     within prefecture unknown" sentinels. ~274 brands FK against these,
--     so skipping them would lose ~8.6% of the brand catalogue.
--
-- (2) ~33 rows with `area_id = 0` — foreign producers (Taiwan Tobacco &
--     Liquor Corp, Korean producers, etc.). Sakenowa parks non-Japanese
--     breweries under area_id 0 since they don't fit the 47-prefecture
--     scheme. ~28 brands FK against these.
--
-- The 0002 migration's strict CHECKs were correct for the "every Sakenowa
-- brewery is a fully-named Japanese kura" mental model. Real data is
-- messier; this migration is the correction.
--
-- brewery_id stays positive (Sakenowa never publishes id <= 0).

ALTER TABLE breweries DROP CONSTRAINT breweries_name_check;
ALTER TABLE breweries DROP CONSTRAINT breweries_name_kanji_check;
ALTER TABLE breweries DROP CONSTRAINT breweries_area_id_check;
ALTER TABLE breweries ADD CONSTRAINT breweries_area_id_check CHECK (area_id >= 0);
