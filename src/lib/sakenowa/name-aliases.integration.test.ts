/**
 * Migration 0019: the other names a sake is sold under (#413). Curated rows
 * with a source, readable by the app's pg-direct reads and not by anon.
 *
 * Real Postgres via testcontainers (tests/integration/setup.ts applies every
 * migration).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL not set — tests/integration/setup.ts should provide it')
}
const pool = new Pool({ connectionString: TEST_DATABASE_URL })

beforeEach(async () => {
  await pool.query('RESET ROLE')
})

afterAll(async () => {
  await pool.query('RESET ROLE')
  await pool.end()
})

describe('other names (migration 0019)', () => {
  it('seeds the first curated names, each with where it is printed', async () => {
    const { rows } = await pool.query(
      `SELECT id, alias, alias_type, source, source_url, note FROM name_aliases WHERE kind = 'brand' ORDER BY id, alias`,
    )
    expect(rows.map((r) => [r.id, r.alias])).toEqual(
      expect.arrayContaining([
        [846, 'Dreamy Clouds'],
        [846, 'Wandering Poet'],
        [3776, 'Ichiaji'],
      ]),
    )
    for (const row of rows) {
      expect(row.source).toBe('manual_curation')
      expect(row.source_url ?? row.note).toBeTruthy()
    }
  })

  it('refuses an alias type outside the four kinds, and an empty alias', async () => {
    await expect(
      pool.query(`INSERT INTO name_aliases (kind, id, alias, alias_type) VALUES ('brand', 1, 'X', 'nickname')`),
    ).rejects.toThrow()
    await expect(
      pool.query(`INSERT INTO name_aliases (kind, id, alias, alias_type) VALUES ('brand', 1, '  ', 'reading')`),
    ).rejects.toThrow()
  })

  it('is not readable by the anon role', async () => {
    await pool.query('SET ROLE anon')
    await expect(pool.query('SELECT * FROM name_aliases')).rejects.toThrow()
    await pool.query('RESET ROLE')
  })
})
