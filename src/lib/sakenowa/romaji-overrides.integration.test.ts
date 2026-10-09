/**
 * Migration 0013: a curated romaji in `name_romaji_overrides` wins over
 * whatever the ingest writes, on insert and on every later upsert, so a
 * re-transliteration can never undo a curated name.
 *
 * Real Postgres via testcontainers (tests/integration/setup.ts applies every
 * migration). Fixture ids sit in the manual-curation range so they cannot
 * collide with the nine overrides the migration seeds.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL not set — tests/integration/setup.ts should provide it')
}
const pool = new Pool({ connectionString: TEST_DATABASE_URL })

const BREWERY_ID = 9_000_901
const BRAND_ID = 9_000_902

async function clean() {
  await pool.query('DELETE FROM brands WHERE brand_id = $1', [BRAND_ID])
  await pool.query('DELETE FROM breweries WHERE brewery_id = $1', [BREWERY_ID])
  await pool.query(`DELETE FROM name_romaji_overrides WHERE id = ANY($1::int[])`, [[BREWERY_ID, BRAND_ID]])
}

beforeEach(async () => {
  await pool.query('RESET ROLE')
  await clean()
})

afterAll(async () => {
  await clean()
  await pool.end()
})

async function seed(brandRomaji: string, breweryRomaji: string) {
  await pool.query(
    `INSERT INTO breweries (brewery_id, name, name_kanji, name_romaji, area_id, source, content_hash)
     VALUES ($1, '瑞鷹酒造', '瑞鷹酒造', $2, 43, 'manual_curation', 'h-brewery')
     ON CONFLICT (brewery_id) DO UPDATE SET name_romaji = EXCLUDED.name_romaji`,
    [BREWERY_ID, breweryRomaji],
  )
  await pool.query(
    `INSERT INTO brands (brand_id, name, name_kanji, name_romaji, brewery_id, source, content_hash)
     VALUES ($1, '瑞鷹', '瑞鷹', $2, $3, 'manual_curation', 'h-brand')
     ON CONFLICT (brand_id) DO UPDATE SET name_romaji = EXCLUDED.name_romaji`,
    [BRAND_ID, brandRomaji, BREWERY_ID],
  )
}

async function romaji() {
  const brand = await pool.query('SELECT name_romaji FROM brands WHERE brand_id = $1', [BRAND_ID])
  const brewery = await pool.query('SELECT name_romaji FROM breweries WHERE brewery_id = $1', [BREWERY_ID])
  return { brand: brand.rows[0]?.name_romaji, brewery: brewery.rows[0]?.name_romaji }
}

describe('curated romaji (migration 0013)', () => {
  it('keeps the transliteration when nothing is curated', async () => {
    await seed('Mizutaka', 'Zuio Shuzo')
    expect(await romaji()).toEqual({ brand: 'Mizutaka', brewery: 'Zuio Shuzo' })
  })

  it('wins over the ingest on insert, and again when a later ingest rewrites the row', async () => {
    await pool.query(
      `INSERT INTO name_romaji_overrides (kind, id, name_romaji) VALUES ('brand', $1, 'Zuiyo'), ('brewery', $2, 'Zuiyo Shuzo')`,
      [BRAND_ID, BREWERY_ID],
    )
    await seed('Mizutaka', 'Zuio Shuzo')
    expect(await romaji()).toEqual({ brand: 'Zuiyo', brewery: 'Zuiyo Shuzo' })

    // A re-transliteration upserts the model's reading again.
    await seed('Mizutaka', 'Zuio Shuzo')
    expect(await romaji()).toEqual({ brand: 'Zuiyo', brewery: 'Zuiyo Shuzo' })
  })

  it('seeds the readings found wrong in the 23-bottle check', async () => {
    const { rows } = await pool.query(
      `SELECT kind, id, name_romaji FROM name_romaji_overrides WHERE id = ANY($1::int[]) ORDER BY kind, id`,
      [[986, 973, 793, 952, 190, 766, 756, 629, 384]],
    )
    expect(rows).toHaveLength(9)
    expect(rows.find((r) => r.kind === 'brand' && r.id === 986)?.name_romaji).toBe('Zuiyo')
  })

  it('is not readable by the anon role', async () => {
    await pool.query('SET ROLE anon')
    await expect(pool.query('SELECT 1 FROM name_romaji_overrides LIMIT 1')).rejects.toThrow()
    await pool.query('RESET ROLE')
  })
})
