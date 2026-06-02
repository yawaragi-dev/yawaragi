import 'server-only'
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'
import type { PublicTable } from './db-tables'
import { getServerDbPool } from './server-client'

/**
 * Type-branded read helper for pg-direct against {@link PublicTable} tables.
 *
 * The first parameter is the **classification token** the caller asserts the
 * query primarily reads from. It is not a programmatic table mention; SQL
 * stays free-form (JOINs are fine — pass the *driving* table name). What it
 * enforces is the adapter pick: calling `publicQuery('taste_profiles', ...)`
 * fails at the type checker, because `taste_profiles` is a `UserTable`, and
 * a user-scoped read must go through `userQuery` so Postgres RLS sees the
 * Clerk JWT.
 *
 * This is the type-level encoding of the rule that until now lived only in
 * ADR-0010's prose. Deleting the convention used to be free; deleting it now
 * is a `Type '"taste_profiles"' is not assignable to type 'PublicTable'`
 * compile error.
 *
 * Callers in test environments may pass an explicit `Pool | PoolClient` (e.g.
 * a testcontainer pool, or an in-transaction `PoolClient`) via `executor`.
 * Omit it in production code; the default goes through {@link getServerDbPool}.
 */
export async function publicQuery<R extends QueryResultRow = QueryResultRow>(
  // The table parameter must be a literal {@link PublicTable} member. It is
  // not used at runtime to *route* the SQL — its purpose is the compile-time
  // gate. The runtime check below only catches pathological coercions
  // (`undefined as never`, `'' as never`) that bypass the type.
  table: PublicTable,
  sql: string,
  params?: readonly unknown[],
  executor?: Pool | PoolClient,
): Promise<QueryResult<R>> {
  if (typeof table !== 'string' || table.length === 0) {
    throw new Error('publicQuery: table classification token must be a non-empty string')
  }
  const pool = executor ?? getServerDbPool()
  // pg's overload set is wide; the (sql, values) overload is the one we want.
  // Cast params through unknown[] — pg expects a mutable array but we accept
  // readonly so callers can pass `as const` literals without copies.
  return pool.query<R>(sql, params as unknown as unknown[])
}
