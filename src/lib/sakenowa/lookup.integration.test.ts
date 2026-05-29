/**
 * Integration tests for the read-side lookup helpers.
 *
 * Exercises real Postgres via testcontainers (set up globally in
 * tests/integration/setup.ts). Seeds fixture brewery + brand rows,
 * asserts the returned shapes match `Brand` / `Brewery`, and confirms
 * behavior on missing IDs.
 *
 * Slice 5 (#48) added the breweries table + FK from brands.brewery_id —
 * fixture inserts now seed a brewery before each brand. Cleanup deletes
 * brands first (FK direction).
 *
 * RLS coverage lives in src/lib/supabase/server-client.integration.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import {
  lookupBrandFromPool,
  lookupBreweryByBrandFromPool,
  lookupFlavorChartFromPool,
} from './lookup'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set; the integration test global setup did not run')
}

const pool = new Pool({ connectionString: TEST_DATABASE_URL })

const FIXTURE_BRAND_IDS = [9001, 9002] as const
const FIXTURE_BREWERY_IDS = [9501, 9502] as const

async function cleanFixtures(): Promise<void> {
  // flavor_charts cascades on brand delete (ON DELETE CASCADE), so the
  // brands DELETE below cleans them too. Belt-and-braces explicit DELETE
  // also covers any orphaned flavor_chart row a future test might create
  // without a matching brand.
  await pool.query('DELETE FROM flavor_charts WHERE brand_id = ANY($1::int[])', [
    [...FIXTURE_BRAND_IDS],
  ])
  await pool.query('DELETE FROM brands WHERE brand_id = ANY($1::int[])', [[...FIXTURE_BRAND_IDS]])
  await pool.query('DELETE FROM breweries WHERE brewery_id = ANY($1::int[])', [
    [...FIXTURE_BREWERY_IDS],
  ])
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
})

async function seedBrewery(opts: {
  breweryId: number
  name?: string
  nameKanji?: string
  areaId?: number
  source?: string
  confidence?: number | null
}): Promise<void> {
  await pool.query(
    `INSERT INTO breweries
       (brewery_id, name, name_kanji, area_id, source, confidence, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.breweryId,
      opts.name ?? 'Reijin Shuzo',
      opts.nameKanji ?? '麗人酒造',
      opts.areaId ?? 20,
      opts.source ?? 'sakenowa',
      opts.confidence ?? null,
      `hash-brewery-${opts.breweryId}`,
    ],
  )
}

describe('lookupBrandFromPool', () => {
  it('returns null when the brandId does not exist', async () => {
    const result = await lookupBrandFromPool(9999, pool)
    expect(result).toBeNull()
  })

  it('returns a fully-shaped Brand for a seeded sakenowa row', async () => {
    await seedBrewery({ breweryId: 9501 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Reijin', '麗人', 9501, 'sakenowa', null, 'hash-fixture-9001'],
    )

    const brand = await lookupBrandFromPool(9001, pool)

    expect(brand).toEqual({
      brandId: 9001,
      name: 'Reijin',
      nameKanji: '麗人',
      breweryId: 9501,
      source: 'sakenowa',
    })
  })

  it('round-trips confidence as a number when set', async () => {
    await seedBrewery({ breweryId: 9502 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9002, 'Test', 'テスト', 9502, 'llm_extracted', 0.75, 'hash-fixture-9002'],
    )

    const brand = await lookupBrandFromPool(9002, pool)

    expect(brand?.confidence).toBe(0.75)
    expect(brand?.source).toBe('llm_extracted')
  })
})

describe('lookupBreweryByBrandFromPool', () => {
  it('returns null when the brandId does not exist', async () => {
    const result = await lookupBreweryByBrandFromPool(9999, pool)
    expect(result).toBeNull()
  })

  it('returns the seeded Brewery joined by brand_id', async () => {
    await seedBrewery({
      breweryId: 9501,
      name: 'Reijin Shuzo',
      nameKanji: '麗人酒造',
      areaId: 20,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Reijin', '麗人', 9501, 'sakenowa', null, 'hash-fixture-9001'],
    )

    const brewery = await lookupBreweryByBrandFromPool(9001, pool)

    expect(brewery).toEqual({
      breweryId: 9501,
      name: 'Reijin Shuzo',
      nameKanji: '麗人酒造',
      areaId: 20,
      source: 'sakenowa',
    })
  })

  it('round-trips confidence as a number when set on the brewery', async () => {
    await seedBrewery({ breweryId: 9502, source: 'llm_extracted', confidence: 0.6 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9002, 'Test', 'テスト', 9502, 'sakenowa', null, 'hash-fixture-9002'],
    )

    const brewery = await lookupBreweryByBrandFromPool(9002, pool)

    expect(brewery?.confidence).toBe(0.6)
    expect(brewery?.source).toBe('llm_extracted')
  })
})

async function seedBrandWithBrewery(brandId: number, breweryId: number): Promise<void> {
  await seedBrewery({ breweryId })
  await pool.query(
    `INSERT INTO brands
       (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [brandId, 'Reijin', '麗人', breweryId, 'sakenowa', null, `hash-fixture-${brandId}`],
  )
}

describe('lookupFlavorChartFromPool', () => {
  it('returns null when no chart exists for the brandId', async () => {
    await seedBrandWithBrewery(9001, 9501)
    const result = await lookupFlavorChartFromPool(9001, pool)
    expect(result).toBeNull()
  })

  it('returns the seeded six-axis chart for a brand', async () => {
    await seedBrandWithBrewery(9001, 9501)
    await pool.query(
      `INSERT INTO flavor_charts
         (brand_id, f1, f2, f3, f4, f5, f6, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [9001, 0.27, 0.51, 0.31, 0.42, 0.46, 0.42, 'sakenowa', null, 'hash-chart-9001'],
    )

    const chart = await lookupFlavorChartFromPool(9001, pool)

    expect(chart).toEqual({
      brandId: 9001,
      f1: 0.27,
      f2: 0.51,
      f3: 0.31,
      f4: 0.42,
      f5: 0.46,
      f6: 0.42,
      source: 'sakenowa',
    })
  })

  it('round-trips confidence as a number when set on the chart', async () => {
    await seedBrandWithBrewery(9002, 9502)
    await pool.query(
      `INSERT INTO flavor_charts
         (brand_id, f1, f2, f3, f4, f5, f6, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [9002, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 'llm_inferred', 0.85, 'hash-chart-9002'],
    )

    const chart = await lookupFlavorChartFromPool(9002, pool)

    expect(chart?.confidence).toBe(0.85)
    expect(chart?.source).toBe('llm_inferred')
  })

  it('cascades from brands.brand_id (deleting a brand removes its chart)', async () => {
    // Confirms the FK cascade we declared in 0004_flavor_charts.sql so
    // future cleanup migrations + orphan-prevention logic can rely on it.
    await seedBrandWithBrewery(9001, 9501)
    await pool.query(
      `INSERT INTO flavor_charts
         (brand_id, f1, f2, f3, f4, f5, f6, source, content_hash)
       VALUES ($1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 'sakenowa', 'hash-chart-cascade')`,
      [9001],
    )
    expect(await lookupFlavorChartFromPool(9001, pool)).not.toBeNull()

    await pool.query('DELETE FROM brands WHERE brand_id = $1', [9001])

    expect(await lookupFlavorChartFromPool(9001, pool)).toBeNull()
  })
})
