/**
 * Compile-time tests for the type barrier between pg-direct and supabase-js
 * adapters. See ADR-0010 + ADR-0011 for the rule being encoded.
 *
 * This file is *only* type-checked (no runtime assertions). It runs via
 * `pnpm typecheck`. The `@ts-expect-error` lines below are the load-bearing
 * checks — if a future change accidentally widens `PublicTable` to include a
 * user-scoped table, or accepts an arbitrary string for the table parameter,
 * one of these lines will fail with "Unused '@ts-expect-error' directive."
 *
 * The file extension `.test-d.ts` is convention from the type-test community
 * (`tsd`, `expect-type`); we don't depend on a runner — tsc itself is the
 * runner.
 *
 * Deletion test: deleting any `@ts-expect-error` block below removes the
 * corresponding compile-time gate. The gate is the whole point of this PR.
 *
 * NB: file is excluded from `vitest` via the project's `*.test.ts` matcher
 * (which intentionally does NOT match `.test-d.ts`). It's still included in
 * `tsc --noEmit` because tsconfig.json globs `**\/*.ts`.
 */
import type { PublicTable, UserTable } from './db-tables'
import { publicQuery } from './public-query'
import { userQuery } from './user-query'

// --- publicQuery accepts every PublicTable name --------------------------

// Typecheck-only: never executed. The body is purely a type assertion harness.
async function _publicQueryAcceptsPublicTables(): Promise<void> {
  await publicQuery('brands', 'SELECT 1')
  await publicQuery('breweries', 'SELECT 1')
  await publicQuery('flavor_charts', 'SELECT 1')
  await publicQuery('areas', 'SELECT 1')
  await publicQuery('flavor_tags', 'SELECT 1')
  await publicQuery('rankings', 'SELECT 1')
  await publicQuery('ingestion_runs', 'SELECT 1')
}
void _publicQueryAcceptsPublicTables

// --- publicQuery REJECTS user-scoped tables ------------------------------

async function _publicQueryRejectsUserTables(): Promise<void> {
  // Preregistered user-scoped table names from ADR-0010 §"Responsibility split".
  // None of these belongs in the PublicTable union. If a future contributor
  // mis-classifies one of them, the @ts-expect-error below stops being an
  // error and the build fails with "Unused '@ts-expect-error' directive."
  // This is the deletion-test guarantee: removing the rule from db-tables.ts
  // (e.g. by widening PublicTable to `string`) is a compile-time failure.

  // @ts-expect-error -- taste_profiles is user-scoped; route through userQuery.
  await publicQuery('taste_profiles', 'SELECT 1')

  // @ts-expect-error -- brand_corrections is user-scoped; route through userQuery.
  await publicQuery('brand_corrections', 'SELECT 1')

  // @ts-expect-error -- rating_events is user-scoped; route through userQuery.
  await publicQuery('rating_events', 'SELECT 1')

  // @ts-expect-error -- arbitrary unknown table name is rejected.
  await publicQuery('totally_made_up_table', 'SELECT 1')
}
void _publicQueryRejectsUserTables

// --- userQuery REJECTS public tables -------------------------------------

function _userQueryRejectsPublicTables(): void {
  // The symmetric check: a Sakenowa public read must NOT route through
  // supabase-js + Clerk JWT (it would hit anon-role RLS, not auth.uid()).
  //
  // Today `UserTable = never`, so EVERY string is rejected — including the
  // public-table names. The @ts-expect-error lines therefore still flag,
  // because no string is assignable to never. The moment UserTable is
  // widened (Phase 2.5+), only the user-table names should pass and the
  // public-table names must keep failing — that's what these guards pin
  // down for the next contributor.

  // @ts-expect-error -- brands is a PublicTable; route through publicQuery.
  userQuery('brands')

  // @ts-expect-error -- breweries is a PublicTable; route through publicQuery.
  userQuery('breweries')

  // @ts-expect-error -- flavor_charts is a PublicTable; route through publicQuery.
  userQuery('flavor_charts')

  // @ts-expect-error -- areas is a PublicTable; route through publicQuery.
  userQuery('areas')

  // @ts-expect-error -- ingestion_runs is admin-only; route through publicQuery (or stay in scripts).
  userQuery('ingestion_runs')
}
void _userQueryRejectsPublicTables

// --- PublicTable and UserTable are disjoint ------------------------------

// If a future edit puts the same table name in both unions, this assignment
// fails with "Type 'X' is not assignable to type 'never'." The fence in
// db-tables.ts (`_disjointCheck`) also fires; this is the read-side mirror.
type _Overlap = Extract<PublicTable, UserTable>
const _noOverlap: _Overlap extends never ? true : false = true
void _noOverlap
