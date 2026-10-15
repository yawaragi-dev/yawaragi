/**
 * Migration 0018: a curated brewery in `brand_brewery_overrides` wins over
 * the one Sakenowa publishes, on insert and on every later upsert, so the
 * ingest can never put a misfiled sake back (#416, #419).
 *
 * Real Postgres via testcontainers (tests/integration/setup.ts applies every
 * migration). Fixture ids sit in the manual-curation range so they cannot
 * collide with the overrides the migration seeds.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL not set — tests/integration/setup.ts should provide it')
}
const pool = new Pool({ connectionString: TEST_DATABASE_URL })

const WRONG_BREWERY = 9_000_911
const RIGHT_BREWERY = 9_000_912
const MISSING_BREWERY = 9_000_913
const BRAND_ID = 9_000_914

async function clean() {
  await pool.query('DELETE FROM brand_brewery_overrides WHERE brand_id = $1', [BRAND_ID])
  await pool.query('DELETE FROM brands WHERE brand_id = $1', [BRAND_ID])
  await pool.query('DELETE FROM breweries WHERE brewery_id = ANY($1::int[])', [[WRONG_BREWERY, RIGHT_BREWERY]])
}

beforeEach(async () => {
  await pool.query('RESET ROLE')
  await clean()
  for (const [id, name] of [
    [WRONG_BREWERY, '田中酒造店'],
    [RIGHT_BREWERY, '田中屋酒造店'],
  ] as const) {
    await pool.query(
      `INSERT INTO breweries (brewery_id, name, name_kanji, name_romaji, area_id, source, content_hash)
       VALUES ($1, $2, $2, NULL, 20, 'manual_curation', 'h-brewery')`,
      [id, name],
    )
  }
})

afterAll(async () => {
  await clean()
  await pool.end()
})

/** What the ingest does: upsert the brand with the brewery Sakenowa names. */
async function ingestBrand(breweryId: number) {
  await pool.query(
    `INSERT INTO brands (brand_id, name, name_kanji, name_romaji, brewery_id, source, content_hash)
     VALUES ($1, '水尾', '水尾', 'Mizuo', $2, 'manual_curation', 'h-brand')
     ON CONFLICT (brand_id) DO UPDATE SET brewery_id = EXCLUDED.brewery_id`,
    [BRAND_ID, breweryId],
  )
}

async function breweryOfBrand(): Promise<number | undefined> {
  const { rows } = await pool.query('SELECT brewery_id FROM brands WHERE brand_id = $1', [BRAND_ID])
  return rows[0]?.brewery_id
}

describe('curated brewery of a sake (migration 0018)', () => {
  it('keeps the brewery Sakenowa publishes when nothing is curated', async () => {
    await ingestBrand(WRONG_BREWERY)
    expect(await breweryOfBrand()).toBe(WRONG_BREWERY)
  })

  it('puts the sake under the curated brewery, on insert and on every later ingest', async () => {
    await pool.query(
      `INSERT INTO brand_brewery_overrides (brand_id, brewery_id, note) VALUES ($1, $2, 'test')`,
      [BRAND_ID, RIGHT_BREWERY],
    )
    await ingestBrand(WRONG_BREWERY)
    expect(await breweryOfBrand()).toBe(RIGHT_BREWERY)
    await ingestBrand(WRONG_BREWERY)
    expect(await breweryOfBrand()).toBe(RIGHT_BREWERY)
  })

  it('leaves the published brewery when the curated one is not in the mirror', async () => {
    await pool.query(
      `INSERT INTO brand_brewery_overrides (brand_id, brewery_id, note) VALUES ($1, $2, 'test')`,
      [BRAND_ID, MISSING_BREWERY],
    )
    await ingestBrand(WRONG_BREWERY)
    expect(await breweryOfBrand()).toBe(WRONG_BREWERY)
  })

  it('is not readable by the anonymous role', async () => {
    await pool.query('SET ROLE anon')
    await expect(pool.query('SELECT * FROM brand_brewery_overrides')).rejects.toThrow()
    await pool.query('RESET ROLE')
  })
})
