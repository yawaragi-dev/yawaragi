/**
 * Integration smoke tests for the Phase 2 DB infrastructure.
 *
 * Verifies that the testcontainer harness in tests/integration/setup.ts:
 *   (1) brings up Postgres,
 *   (2) bootstraps Supabase roles,
 *   (3) applies migrations (creates the brands + breweries tables + RLS policies).
 *
 * Subsequent slices (#49–#52) reuse the same harness with their own
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
    // Seed brewery first so the FK isn't what causes the insert to fail —
    // we want this test to fail-for-the-right-reason (grant/RLS), not
    // accidentally pass because of the brewery_id FK introduced in slice 5.
    await pool.query(
      "INSERT INTO breweries (brewery_id, name, name_kanji, area_id, source, content_hash) VALUES (49, '麗人酒造', '麗人酒造', 20, 'sakenowa', 'brewery-hash') ON CONFLICT DO NOTHING",
    )
    await pool.query('SET ROLE anon')
    await expect(
      pool.query(
        "INSERT INTO brands (brand_id, name, name_kanji, brewery_id, source, content_hash) VALUES (1, 'Reijin', '麗人', 49, 'sakenowa', 'hash')",
      ),
    ).rejects.toThrow()
  })

  it('owner role (BYPASSRLS via migration runner) CAN INSERT + SELECT', async () => {
    await pool.query(
      "INSERT INTO breweries (brewery_id, name, name_kanji, area_id, source, content_hash) VALUES (49, '麗人酒造', '麗人酒造', 20, 'sakenowa', 'brewery-hash') ON CONFLICT DO NOTHING",
    )
    await pool.query(
      "INSERT INTO brands (brand_id, name, name_kanji, brewery_id, source, content_hash) VALUES (1, 'Reijin', '麗人', 49, 'sakenowa', 'hash')",
    )
    const { rows } = await pool.query<{ name_kanji: string }>('SELECT name_kanji FROM brands WHERE brand_id = 1')
    expect(rows[0].name_kanji).toBe('麗人')
    await pool.query('DELETE FROM brands WHERE brand_id = 1')
    await pool.query('DELETE FROM breweries WHERE brewery_id = 49')
  })

  it('migrations created the breweries table with the expected columns', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'breweries' ORDER BY column_name",
    )
    const names = rows.map((r) => r.column_name).sort()
    expect(names).toEqual(
      ['area_id', 'brewery_id', 'confidence', 'content_hash', 'name', 'name_kanji', 'source', 'updated_at'].sort(),
    )
  })

  it('brands.brewery_id has a real FK to breweries.brewery_id', async () => {
    const { rows } = await pool.query<{ conname: string }>(
      `SELECT conname
       FROM pg_constraint
       WHERE conrelid = 'public.brands'::regclass
         AND contype = 'f'
         AND confrelid = 'public.breweries'::regclass`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].conname).toBe('brands_brewery_id_fkey')
  })

  it('RLS is enabled on breweries', async () => {
    const { rows } = await pool.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.breweries'::regclass",
    )
    expect(rows[0].relrowsecurity).toBe(true)
  })

  it('anon role can SELECT from breweries (RLS policy permits)', async () => {
    await pool.query('SET ROLE anon')
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM breweries',
    )
    expect(rows[0].count).toBe('0')
  })

  // Regression: testcontainer bootstrap (tests/integration/bootstrap.sql) must
  // mirror Supabase's default schema-level grants. Without USAGE on public,
  // anon couldn't resolve `public.brands` at all even with per-table SELECT.
  // Without ALTER DEFAULT PRIVILEGES, a future migration that forgets a
  // per-table grant would pass tests but fail in production. See #68.
  it('anon role has USAGE on public schema (Supabase parity)', async () => {
    const { rows } = await pool.query<{ has_usage: boolean }>(
      "SELECT has_schema_privilege('anon', 'public', 'USAGE') AS has_usage",
    )
    expect(rows[0].has_usage).toBe(true)
  })

  it('authenticated role has USAGE on public schema (Supabase parity)', async () => {
    const { rows } = await pool.query<{ has_usage: boolean }>(
      "SELECT has_schema_privilege('authenticated', 'public', 'USAGE') AS has_usage",
    )
    expect(rows[0].has_usage).toBe(true)
  })

  it('default privileges grant anon SELECT on newly-created public tables', async () => {
    // Create an ephemeral table as the migration runner (CURRENT_USER) and
    // verify the ALTER DEFAULT PRIVILEGES from bootstrap.sql applies — anon
    // gets SELECT without an explicit per-table GRANT.
    await pool.query('CREATE TABLE bootstrap_default_grants_probe (id INTEGER)')
    try {
      const { rows } = await pool.query<{ has_select: boolean }>(
        "SELECT has_table_privilege('anon', 'public.bootstrap_default_grants_probe', 'SELECT') AS has_select",
      )
      expect(rows[0].has_select).toBe(true)
    } finally {
      await pool.query('DROP TABLE bootstrap_default_grants_probe')
    }
  })

  it('service_role bypasses RLS (BYPASSRLS attribute)', async () => {
    const { rows } = await pool.query<{ rolbypassrls: boolean }>(
      "SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'",
    )
    expect(rows[0].rolbypassrls).toBe(true)
  })
})
