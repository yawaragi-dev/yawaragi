/**
 * Integration tests for the journal sake picker (P5.5-C2b, #244).
 *
 * Exercises real Postgres via testcontainers (global setup in
 * tests/integration/setup.ts). Seeds brewery + brand + flavor_chart fixtures and
 * asserts: substring match over name / kanji / romaji, exclusion of chartless
 * brands (the INNER JOIN), length-then-name ordering, the limit cap, and that a
 * user-typed `%` is matched literally rather than as a wildcard.
 *
 * Harness mirrors lookup.integration.test.ts (RESET ROLE, delete children before
 * parents on the FK direction flavor_charts → brands → breweries).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { searchBrandsFromPool } from '@/lib/sakenowa/search-brands'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set; the integration test global setup did not run')
}

const pool = new Pool({ connectionString: TEST_DATABASE_URL })

const FIXTURE_BRAND_IDS = [9111, 9112, 9113] as const
const FIXTURE_BREWERY_IDS = [9611] as const

async function cleanFixtures(): Promise<void> {
  await pool.query('DELETE FROM flavor_charts WHERE brand_id = ANY($1::int[])', [
    [...FIXTURE_BRAND_IDS],
  ])
  await pool.query('DELETE FROM brands WHERE brand_id = ANY($1::int[])', [[...FIXTURE_BRAND_IDS]])
  await pool.query('DELETE FROM breweries WHERE brewery_id = ANY($1::int[])', [
    [...FIXTURE_BREWERY_IDS],
  ])
}

async function seedBrewery(): Promise<void> {
  await pool.query(
    `INSERT INTO breweries
       (brewery_id, name, name_kanji, area_id, source, confidence, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [9611, 'Fixture Shuzo', '架空酒造', 20, 'sakenowa', null, 'hash-brewery-9611'],
  )
}

async function seedBrand(opts: {
  brandId: number
  name: string
  nameKanji: string
  nameRomaji: string | null
}): Promise<void> {
  await pool.query(
    `INSERT INTO brands
       (brand_id, name, name_kanji, name_romaji, brewery_id, source, confidence, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      opts.brandId,
      opts.name,
      opts.nameKanji,
      opts.nameRomaji,
      9611,
      'sakenowa',
      null,
      `hash-brand-${opts.brandId}`,
    ],
  )
}

async function seedChart(brandId: number): Promise<void> {
  await pool.query(
    `INSERT INTO flavor_charts
       (brand_id, f1, f2, f3, f4, f5, f6, source, content_hash)
     VALUES ($1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 'sakenowa', $2)`,
    [brandId, `hash-chart-${brandId}`],
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
  await seedBrewery()
  // 9111 "Nabeshima" + 9112 "Nabe" both have charts and share "nabe";
  // 9113 "Nabex" has NO chart, so it must never surface.
  await seedBrand({ brandId: 9111, name: 'Nabeshima', nameKanji: '鍋島', nameRomaji: 'Nabeshima' })
  await seedBrand({ brandId: 9112, name: 'Nabe', nameKanji: '鍋', nameRomaji: 'Nabe' })
  await seedBrand({ brandId: 9113, name: 'Nabex', nameKanji: '鍋X', nameRomaji: 'Nabex' })
  await seedChart(9111)
  await seedChart(9112)
  // deliberately no chart for 9113
})

describe('searchBrandsFromPool', () => {
  it('matches a case-insensitive romaji substring, shortest name first', async () => {
    const results = await searchBrandsFromPool('nabe', pool)
    // 9112 "Nabe" (4 chars) orders before 9111 "Nabeshima" (9 chars).
    expect(results.map((b) => b.brandId)).toEqual([9112, 9111])
  })

  it('matches on the kanji name', async () => {
    const results = await searchBrandsFromPool('鍋', pool)
    expect(results.map((b) => b.brandId)).toEqual([9112, 9111])
  })

  it('excludes a brand that has no flavor chart (nothing to log)', async () => {
    const results = await searchBrandsFromPool('nabe', pool)
    expect(results.map((b) => b.brandId)).not.toContain(9113)
  })

  it('respects the limit', async () => {
    const results = await searchBrandsFromPool('nabe', pool, 1)
    expect(results.map((b) => b.brandId)).toEqual([9112])
  })

  it('treats a user-typed % literally, not as a wildcard', async () => {
    // If % were an unescaped wildcard this would match every seeded brand.
    const results = await searchBrandsFromPool('%', pool)
    expect(results).toEqual([])
  })

  it('returns fully-shaped Brand rows', async () => {
    const [first] = await searchBrandsFromPool('鍋島', pool)
    expect(first).toMatchObject({
      brandId: 9111,
      name: 'Nabeshima',
      nameKanji: '鍋島',
      nameRomaji: 'Nabeshima',
      source: 'sakenowa',
    })
  })
})
