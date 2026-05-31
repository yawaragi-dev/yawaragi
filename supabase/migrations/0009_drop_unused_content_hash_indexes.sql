-- See #79. 0001 and 0002 created a btree index on brands.content_hash and
-- breweries.content_hash respectively, intending an "idempotency fast-path"
-- for ingestion. The pipeline never uses them — see
-- src/lib/sakenowa/{db,ingestion-pipeline}.ts: existing hashes are read into
-- a JS Map (full table scan) and compared in-memory. No query ever WHEREs
-- on content_hash, so the planner never picks these indexes; they just
-- slow down every INSERT/UPDATE and waste disk.
--
-- Slice 6 (#49) and slice 9 (#52) already declined to add the same dead
-- index on flavor_charts / areas / flavor_tags / rankings. Dropping the
-- original two closes out the antipattern entirely.
--
-- Numbered 0009 on the assumption slice 9 (#52, currently in PR #81)
-- lands first and fills 0005..0008. If it doesn't, renumber on rebase —
-- the migrations are still order-independent for content (no FK or seed
-- dependency between this migration and slice 9's).
DROP INDEX IF EXISTS brands_content_hash_idx;
DROP INDEX IF EXISTS breweries_content_hash_idx;
