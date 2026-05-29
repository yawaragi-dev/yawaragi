/**
 * Integration smoke tests for the Phase 2 DB infrastructure.
 *
 * Verifies that the testcontainer harness in tests/integration/setup.ts:
 *   (1) brings up Postgres,
 *   (2) bootstraps Supabase roles,
 *   (3) applies migrations (creates the brands table + RLS policy).
 *
 * Subsequent slices (#48–#52) reuse the same harness with their own
 * `*.integration.test.ts` files. RLS coverage is the load-bearing part —
 * Phase 2 has no client-side data path yet, but the policy is in place
 * forward-looking and this test ensures the configuration stays correct.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set; the integration test global setup did not run')
}

const pool = new Pool({ connectionString: TEST_DATABASE_URL })

afterAll(async () => {
  await pool.end()
})

beforeEach(async () => {
  await pool.query('RESET ROLE')
})

describe('database integration smoke', () => {
  it('connects to the testcontainer Postgres', async () => {
    const { rows } = await pool.query<{ now: string }>('SELECT NOW()::text AS now')
    expect(rows[0].now).toBeTruthy()
  })

  it('migrations created the brands table', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brands'",
    )
    expect(rows).toHaveLength(1)
  })

  it('brands table has the expected columns', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brands' ORDER BY column_name",
    )
    const names = rows.map((r) => r.column_name).sort()
    expect(names).toEqual(
      ['brand_id', 'brewery_id', 'confidence', 'content_hash', 'name', 'name_kanji', 'source', 'updated_at'].sort(),
    )
  })

  it('provenance_source enum has the canonical 7 values', async () => {
    const { rows } = await pool.query<{ enumlabel: string }>(
      "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'provenance_source'::regtype ORDER BY enumsortorder",
    )
    expect(rows.map((r) => r.enumlabel)).toEqual([
      'sakenowa',
      'sakenowa_inferred',
      'llm_extracted',
      'llm_inferred',
      'cross_beverage_map',
      'user_corrected',
      'manual_curation',
    ])
  })

  it('RLS is enabled on brands', async () => {
    const { rows } = await pool.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.brands'::regclass",
    )
    expect(rows[0].relrowsecurity).toBe(true)
  })

  it('anon role can SELECT from brands (RLS policy permits)', async () => {
    await pool.query('SET ROLE anon')
    const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM brands')
    expect(rows[0].count).toBe('0')
  })

  it('anon role CANNOT INSERT into brands (no grant + RLS)', async () => {
    await pool.query('SET ROLE anon')
    await expect(
      pool.query(
        "INSERT INTO brands (brand_id, name, name_kanji, brewery_id, source, content_hash) VALUES (1, 'Reijin', '麗人', 49, 'sakenowa', 'hash')",
      ),
    ).rejects.toThrow()
  })

  it('owner role (BYPASSRLS via migration runner) CAN INSERT + SELECT', async () => {
    await pool.query(
      "INSERT INTO brands (brand_id, name, name_kanji, brewery_id, source, content_hash) VALUES (1, 'Reijin', '麗人', 49, 'sakenowa', 'hash')",
    )
    const { rows } = await pool.query<{ name_kanji: string }>('SELECT name_kanji FROM brands WHERE brand_id = 1')
    expect(rows[0].name_kanji).toBe('麗人')
    await pool.query('DELETE FROM brands WHERE brand_id = 1')
  })
})
