/**
 * Canary: proves the user-scoped RLS test seam (#219) works end-to-end BEFORE
 * any real `user_id` table exists.
 *
 * The Taste Profile builder (Phase 5) is the first surface where "user A must
 * never read user B's row" is a load-bearing security property enforced by
 * Postgres RLS (`auth.uid() = user_id`), populated by PostgREST from a verified
 * Clerk JWT. This test exercises that exact mechanism against a THROWAWAY table
 * created and dropped inside this file — NOT a real migration and NOT
 * `taste_profiles` (that lands in Phase 5). It pins three things:
 *
 *   1. the `auth.uid()` shim (bootstrap.sql) resolves the sub the harness sets,
 *   2. `withUserContext(sub)` scopes a query the way a signed-in request would,
 *   3. cross-user isolation actually holds — user A sees only A's rows.
 *
 * The isolation assertions are written so they would FAIL if the policy were
 * `USING (true)` (A would then see B's rows). That's the point: this guards the
 * mechanism, not just the plumbing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { withUserContext } from './with-user-context'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set; the integration test global setup did not run')
}

const pool = new Pool({ connectionString: TEST_DATABASE_URL })

const USER_A = 'user_2AAAAAAAAAAAAAAAAAAAAAAAAA'
const USER_B = 'user_2BBBBBBBBBBBBBBBBBBBBBBBBB'

beforeAll(async () => {
  await pool.query('RESET ROLE')
  // Throwaway table: a minimal user-scoped shape. TEXT user_id because Clerk
  // subjects (`user_…`) are not UUIDs — same reason bootstrap's auth.uid()
  // returns text.
  await pool.query('DROP TABLE IF EXISTS rls_canary')
  await pool.query(`
    CREATE TABLE rls_canary (
      id      SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      note    TEXT NOT NULL
    )
  `)
  await pool.query('ALTER TABLE rls_canary ENABLE ROW LEVEL SECURITY')
  // The `authenticated` role needs SELECT before RLS is even consulted; the
  // bootstrap default-privilege grant covers this, but state it explicitly so
  // the canary doesn't silently depend on that.
  await pool.query('GRANT SELECT ON rls_canary TO authenticated')
  // The load-bearing policy: a row is visible only to its owner.
  await pool.query(`
    CREATE POLICY rls_canary_owner_select
      ON rls_canary
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id)
  `)
  // Seed as the migration-runner role (BYPASSRLS) so the fixtures land
  // regardless of the policy.
  await pool.query(
    `INSERT INTO rls_canary (user_id, note) VALUES
       ($1, 'a-first'),
       ($1, 'a-second'),
       ($2, 'b-only')`,
    [USER_A, USER_B],
  )
})

afterAll(async () => {
  await pool.query('RESET ROLE')
  await pool.query('DROP TABLE IF EXISTS rls_canary')
  await pool.end()
})

describe('user-scoped RLS canary', () => {
  it('auth.uid() resolves the sub that withUserContext sets', async () => {
    const uid = await withUserContext(pool, USER_A, async (client) => {
      const { rows } = await client.query<{ uid: string }>('SELECT auth.uid() AS uid')
      return rows[0]?.uid
    })
    expect(uid).toBe(USER_A)
  })

  it('a signed-in user sees only their own rows', async () => {
    const notes = await withUserContext(pool, USER_A, async (client) => {
      const { rows } = await client.query<{ note: string }>(
        'SELECT note FROM rls_canary ORDER BY note',
      )
      return rows.map((r) => r.note)
    })
    expect(notes).toEqual(['a-first', 'a-second'])
  })

  it("a signed-in user CANNOT see another user's rows", async () => {
    // The direct cross-user leak assertion. If the policy were USING (true),
    // 'b-only' would appear here and this fails — which is exactly the bug the
    // seam has to catch for Phase 5.
    const userIds = await withUserContext(pool, USER_A, async (client) => {
      const { rows } = await client.query<{ user_id: string }>('SELECT user_id FROM rls_canary')
      return rows.map((r) => r.user_id)
    })
    expect(userIds).not.toContain(USER_B)
    expect(new Set(userIds)).toEqual(new Set([USER_A]))
  })

  it('symmetry: the other user sees only their own single row', async () => {
    const notes = await withUserContext(pool, USER_B, async (client) => {
      const { rows } = await client.query<{ note: string }>('SELECT note FROM rls_canary')
      return rows.map((r) => r.note)
    })
    expect(notes).toEqual(['b-only'])
  })

  it('an anonymous caller (no context) sees nothing — RLS default-denies anon', async () => {
    // Baseline: anon holds table-level SELECT (bootstrap default grants) but
    // there is NO policy admitting anon, so RLS default-denies and the read
    // returns zero rows — it does not error. This is the DB-level twin of the
    // getUserScopedClient() loud-failure contract (user-client.ts): an
    // unauthenticated position must never surface a user's rows.
    await pool.query('RESET ROLE')
    await pool.query('SET ROLE anon')
    try {
      const { rows } = await pool.query('SELECT note FROM rls_canary')
      expect(rows).toHaveLength(0)
    } finally {
      await pool.query('RESET ROLE')
    }
  })
})
