/**
 * Integration coverage for the `mcp_read` redirect schema (migration 0012).
 *
 * This is the Yawaragi-side half of the ADR-0014 cross-repo invariant
 * "all public read queries filter `superseded_at IS NULL`". The deployed
 * `@yawaragi/sakenowa-mcp` server references tables by bare name and is
 * pointed at `search_path=mcp_read,public`, so its `FROM brands` resolves to
 * the filtered `mcp_read.brands` view. These tests prove:
 *
 *   1. the views themselves exclude superseded rows, and
 *   2. the bare-name + search_path redirect the MCP actually uses yields the
 *      filtered result (and unshadowed tables still fall through to public).
 *
 * Real Postgres via testcontainers (global setup in tests/integration/
 * setup.ts applies every migration, including 0012).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set; the integration test global setup did not run')
}

const pool = new Pool({ connectionString: TEST_DATABASE_URL })

// Live rows use the Sakenowa ID range (< 1_000_000). The superseded fixture
// is a manual_curation row, which the 0011 range CHECK requires be >=
// 9_000_000 — the same shape a real superseded manual override has.
const LIVE_BREWERY_ID = 9501
const LIVE_BRAND_ID = 9001
const SUPERSEDED_BREWERY_ID = 9_000_001
const SUPERSEDED_BRAND_ID = 9_000_001

async function cleanFixtures(): Promise<void> {
  await pool.query('DELETE FROM brands WHERE brand_id = ANY($1::int[])', [
    [LIVE_BRAND_ID, SUPERSEDED_BRAND_ID],
  ])
  await pool.query('DELETE FROM breweries WHERE brewery_id = ANY($1::int[])', [
    [LIVE_BREWERY_ID, SUPERSEDED_BREWERY_ID],
  ])
}

async function seedFixtures(): Promise<void> {
  // A live Sakenowa brewery + brand (superseded_at NULL).
  await pool.query(
    `INSERT INTO breweries (brewery_id, name, name_kanji, area_id, source, confidence, content_hash)
     VALUES ($1, 'Reijin Shuzo', '麗人酒造', 20, 'sakenowa', NULL, 'hash-brewery-live')`,
    [LIVE_BREWERY_ID],
  )
  await pool.query(
    `INSERT INTO brands (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
     VALUES ($1, 'Reijin', '麗人', $2, 'sakenowa', NULL, 'hash-brand-live')`,
    [LIVE_BRAND_ID, LIVE_BREWERY_ID],
  )

  // A superseded manual_curation brewery + brand (superseded_at set) — the
  // exact case ADR-0014 says must vanish from every public read path.
  await pool.query(
    `INSERT INTO breweries (brewery_id, name, name_kanji, area_id, source, confidence, content_hash, superseded_at)
     VALUES ($1, 'Ghost Kura', '亡霊酒造', 20, 'manual_curation', NULL, 'hash-brewery-superseded', NOW())`,
    [SUPERSEDED_BREWERY_ID],
  )
  await pool.query(
    `INSERT INTO brands (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash, superseded_at)
     VALUES ($1, 'Ghost', '亡霊', $2, 'manual_curation', NULL, 'hash-brand-superseded', NOW())`,
    [SUPERSEDED_BRAND_ID, SUPERSEDED_BREWERY_ID],
  )
}

beforeAll(async () => {
  await pool.query('RESET ROLE')
})

afterAll(async () => {
  await cleanFixtures()
  await pool.end()
})

beforeEach(async () => {
  await pool.query('RESET ROLE')
  await cleanFixtures()
  await seedFixtures()
})

describe('mcp_read views', () => {
  it('mcp_read.brands hides superseded rows but keeps live ones', async () => {
    const { rows } = await pool.query<{ brand_id: number }>(
      'SELECT brand_id FROM mcp_read.brands WHERE brand_id = ANY($1::int[]) ORDER BY brand_id',
      [[LIVE_BRAND_ID, SUPERSEDED_BRAND_ID]],
    )
    expect(rows.map((r) => r.brand_id)).toEqual([LIVE_BRAND_ID])
  })

  it('mcp_read.breweries hides superseded rows but keeps live ones', async () => {
    const { rows } = await pool.query<{ brewery_id: number }>(
      'SELECT brewery_id FROM mcp_read.breweries WHERE brewery_id = ANY($1::int[]) ORDER BY brewery_id',
      [[LIVE_BREWERY_ID, SUPERSEDED_BREWERY_ID]],
    )
    expect(rows.map((r) => r.brewery_id)).toEqual([LIVE_BREWERY_ID])
  })

  it('exposes every base column so the MCP reads it as a transparent mirror', async () => {
    const { rows } = await pool.query<{ name: string; name_kanji: string; source: string }>(
      'SELECT name, name_kanji, source FROM mcp_read.brands WHERE brand_id = $1',
      [LIVE_BRAND_ID],
    )
    expect(rows[0]).toEqual({ name: 'Reijin', name_kanji: '麗人', source: 'sakenowa' })
  })

  it('redirects the MCP’s bare-name query via search_path (the deployed mechanism)', async () => {
    // Reproduce exactly what the deployed MCP does: bare `FROM brands` /
    // `JOIN breweries` under search_path=mcp_read,public. SET LOCAL keeps
    // the change scoped to this transaction so it can't leak to the pool.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL search_path = mcp_read, public')

      // The canonical SAKE_FROM join, bare-named like the MCP writes it.
      const { rows } = await client.query<{ brand_id: number }>(
        `SELECT s.brand_id
           FROM brands s
           JOIN breweries b ON b.brewery_id = s.brewery_id
          WHERE s.brand_id = ANY($1::int[])
          ORDER BY s.brand_id`,
        [[LIVE_BRAND_ID, SUPERSEDED_BRAND_ID]],
      )
      expect(rows.map((r) => r.brand_id)).toEqual([LIVE_BRAND_ID])

      // Unshadowed tables (no superseded_at) still resolve — they fall
      // through to public. `areas` is seeded by migration 0005.
      const areas = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM areas',
      )
      expect(Number(areas.rows[0]!.count)).toBeGreaterThan(0)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })
})
