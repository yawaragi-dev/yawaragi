import type { Pool, PoolClient } from 'pg'

/**
 * Run a callback as if authenticated as Clerk subject `sub`.
 *
 * This is the test-harness counterpart to what PostgREST does per request in
 * production: it assumes the `authenticated` role and populates the JWT-claims
 * GUC that `auth.uid()` (tests/integration/bootstrap.sql) reads. Inside the
 * callback, any RLS policy of the form `USING (auth.uid() = user_id)` sees
 * `sub` as the current user, so the query is scoped exactly as a real signed-in
 * request would be.
 *
 * Both the role switch and the GUC are set with `SET LOCAL` semantics inside a
 * transaction, so they are automatically reverted when the transaction ends —
 * the borrowed pool client is returned to the pool clean, with no `RESET ROLE`
 * bookkeeping to forget. The transaction is rolled back (the callback is for
 * assertions against already-committed fixture rows, not for persisting writes;
 * anything the callback writes is discarded, which keeps tests isolated).
 *
 * Usage:
 * ```ts
 * const rows = await withUserContext(pool, 'user-a', async (client) => {
 *   const res = await client.query('SELECT user_id FROM my_table')
 *   return res.rows
 * })
 * ```
 */
export async function withUserContext<T>(
  pool: Pool,
  sub: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Drop BYPASSRLS: run as the non-privileged role PostgREST uses so RLS is
    // actually evaluated. SET LOCAL scopes this to the transaction.
    await client.query('SET LOCAL ROLE authenticated')
    // Mirror what PostgREST writes from a verified Clerk JWT: the full claim
    // set as JSON under `request.jwt.claims`. auth.uid() extracts `sub`.
    // set_config(name, value, is_local => true) is the parameterised form of
    // SET LOCAL (SET LOCAL itself can't take a bind parameter).
    await client.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub, role: 'authenticated' }),
    ])
    const result = await fn(client)
    await client.query('ROLLBACK')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
