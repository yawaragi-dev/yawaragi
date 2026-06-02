/**
 * Source-of-truth classification for every table in the Supabase project.
 *
 * The split is the type-level encoding of ADR-0010:
 *   - `PublicTable`  — public Sakenowa reference + admin telemetry. Reads run
 *                      through pg-direct via {@link publicQuery}; writes only
 *                      from `pnpm ingest` / `pnpm migrate`.
 *   - `UserTable`    — anything keyed on `user_id` (or another Clerk-linked
 *                      identifier). Reads/writes must route through
 *                      {@link userQuery} (supabase-js + Clerk JWT) so Postgres
 *                      RLS enforces `auth.uid()`, not TypeScript code that a
 *                      future contributor or AI agent could subtly bypass.
 *
 * The two unions are intentionally disjoint. `_disjointCheck` below is a
 * compile-time fence: if a contributor adds a table name to both sets, the
 * type-checker fails. Walking `supabase/migrations/*.sql` is the only place
 * to discover new tables today (no codegen step yet — option C in the PR body).
 *
 * **When you add a migration that creates a new table, decide here first.**
 * A table is `UserTable` iff one of the following is true:
 *   1. It has a `user_id` column (or other Clerk-linked identifier) AND
 *      the column participates in a per-user RLS policy.
 *   2. It holds personal data per ADR-0009's RoPA, regardless of column name.
 * Everything else (Sakenowa mirror, telemetry, ingestion bookkeeping) is
 * `PublicTable`.
 *
 * See:
 *   - docs/adr/0010-pg-direct-vs-supabase-js-for-user-data.md
 *   - docs/adr/0011-per-env-data-isolation.md
 */

/**
 * Tables that are safe to read with pg-direct via the `postgres` (BYPASSRLS)
 * role. Public Sakenowa reference data, plus admin-only telemetry. None of
 * these contain personal data.
 */
export type PublicTable =
  | 'brands'
  | 'breweries'
  | 'flavor_charts'
  | 'areas'
  | 'flavor_tags'
  | 'rankings'
  | 'ingestion_runs'

/**
 * Tables whose rows are scoped to a single Clerk user. Reads/writes MUST
 * route through {@link userQuery} so PostgREST forwards the Clerk JWT and
 * Postgres RLS evaluates `auth.uid()`.
 *
 * Empty today — Phase 2 ships only the Sakenowa reference mirror. Phase 2.5+
 * will land `taste_profiles`, `brand_corrections`, `rating_events`. Names are
 * pre-registered as compile-time failures in `public-query.test-d.ts` so the
 * type barrier exists the moment the first migration lands (and ADR-0011's
 * per-env isolation gate fires).
 */
export type UserTable = never

// Compile-time guard: PublicTable and UserTable are disjoint. If a name is
// ever added to both, this triggers `Type '...' is not assignable to type
// 'never'.` See `public-query.test-d.ts` for the read-side mirror.
type _DisjointCheck = Extract<PublicTable, UserTable> extends never ? true : never
const _disjointCheck: _DisjointCheck = true
void _disjointCheck

/**
 * Every table the app knows about. Useful for migration / drift checks; not
 * a query-routing input.
 */
export type AnyTable = PublicTable | UserTable
