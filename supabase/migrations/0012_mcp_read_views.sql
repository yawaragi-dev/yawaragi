-- MCP read path: superseded-row filtering via a redirect schema (ADR-0014).
--
-- The problem
-- -----------
-- ADR-0014 §"Read-side" states plainly: "All public read queries filter
-- `superseded_at IS NULL`." The pg-direct scan path (`src/lib/sakenowa/
-- lookup.ts`) honours this on every query. The suggest surface, however,
-- reads the SAME mirror over the network from the deployed
-- `@yawaragi/sakenowa-mcp` server (ADR-0003 — a separate, generic OSS
-- asset), whose `SAKE_FROM` joins `brands`/`breweries` with NO such filter.
-- So a manual_curation row that Sakenowa later superseded stays hidden on
-- the sake page but can still surface in a chat answer. That is a live
-- ADR-0014 violation on the MCP path.
--
-- Why not fix it in the MCP
-- -------------------------
-- `superseded_at` is a Yawaragi-specific column (added by migration 0011
-- for the manual-curation layer), NOT part of the vanilla Sakenowa schema.
-- The MCP is marketed as standalone-runnable against any Sakenowa mirror,
-- so baking `WHERE superseded_at IS NULL` into its core query would break
-- every standalone user whose mirror lacks the column, and couple the
-- generic server to a Yawaragi concept — against ADR-0003's decoupling.
--
-- The fix (Yawaragi-side, zero MCP code change)
-- ---------------------------------------------
-- The MCP references tables by BARE name (`FROM brands`, `JOIN breweries`),
-- so a Postgres `search_path` transparently redirects them. This migration
-- creates an `mcp_read` schema holding filtered passthrough views named
-- exactly `brands` / `breweries`. The Yawaragi-deployed MCP instance sets
--   DATABASE_URL=...?options=-c%20search_path%3Dmcp_read,public
-- so its `FROM brands` resolves to `mcp_read.brands` (superseded rows
-- excluded), while every unshadowed table (areas, flavor_charts, rankings,
-- flavor_tags, brand_flavor_tags — none of which carry `superseded_at`)
-- falls through to `public`. Standalone OSS users don't set the search_path
-- and are entirely unaffected. See docs/development/local-mcp.md §3.3.
--
-- The single predicate `superseded_at IS NULL` now lives in exactly one
-- place per table (these views) for the MCP path — the shared read contract
-- ADR-0014's invariant always implied.

CREATE SCHEMA IF NOT EXISTS mcp_read;

-- The MCP connects as a Supabase-standard restricted role via its own
-- DATABASE_URL. Grant it reach into the schema. service_role bypasses RLS
-- and already owns nothing here; a bespoke MCP role (if ever introduced)
-- needs the same two grants added explicitly.
GRANT USAGE ON SCHEMA mcp_read TO anon, authenticated;

-- Filtered passthrough views. `SELECT *` (not a pinned column list) keeps
-- them transparent mirrors — the MCP reads whatever columns it needs and a
-- future column add to the base table is picked up on the next view
-- recreate. Base tables are fully qualified to `public.*` so the view never
-- self-references once mcp_read is on the search_path. Views are owned by
-- the migration runner, so SELECT on the view is sufficient — grantees need
-- no direct grant on the base tables.
CREATE VIEW mcp_read.brands AS
  SELECT * FROM public.brands WHERE superseded_at IS NULL;

CREATE VIEW mcp_read.breweries AS
  SELECT * FROM public.breweries WHERE superseded_at IS NULL;

GRANT SELECT ON mcp_read.brands TO anon, authenticated;
GRANT SELECT ON mcp_read.breweries TO anon, authenticated;
