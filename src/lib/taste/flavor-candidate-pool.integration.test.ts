/**
 * Integration test for the recommender's candidate-pool query. Exercises real
 * Postgres via testcontainers (tests/integration/setup.ts). Verifies the SQL
 * the P5-05b recommendations rely on: the flavor_charts↔brands join, the
 * `superseded_at IS NULL` filter (ADR-0014), and that chartless brands are
 * excluded — none of which the pure `poolRowToCandidate` unit test can cover.
 *
 * Seed shapes copied from lookup.integration.test.ts. Cleanup deletes children
 * first (flavor_charts → brands → breweries).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { getFlavorCandidatePoolFromPool } from './flavor-candidate-pool'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set; the integration test global setup did not run')
}
const pool = new Pool({ connectionString: TEST_DATABASE_URL })

const BREWERY_ID = 9601
const LIVE_CHARTED = 9101 // live + chart → included
const SUPERSEDED_CHARTED = 9102 // superseded + chart → excluded
const LIVE_NO_CHART = 9103 // live, no chart → excluded by the join
const BRAND_IDS = [LIVE_CHARTED, SUPERSEDED_CHARTED, LIVE_NO_CHART]

async function clean(): Promise<void> {
  await pool.query('DELETE FROM flavor_charts WHERE brand_id = ANY($1::int[])', [BRAND_IDS])
  await pool.query('DELETE FROM brands WHERE brand_id = ANY($1::int[])', [BRAND_IDS])
  await pool.query('DELETE FROM breweries WHERE brewery_id = $1', [BREWERY_ID])
}

beforeAll(async () => {
  await pool.query('RESET ROLE')
})
afterAll(async () => {
  await clean()
  await pool.end()
})
beforeEach(async () => {
  await pool.query('RESET ROLE')
  await clean()
})

async function seedBrewery(): Promise<void> {
  await pool.query(
    `INSERT INTO breweries (brewery_id, name, name_kanji, area_id, source, confidence, content_hash)
     VALUES ($1, 'Test Brewery', 'テスト酒造', 20, 'sakenowa', null, $2)`,
    [BREWERY_ID, `hash-brewery-${BREWERY_ID}`],
  )
}

async function seedBrand(
  brandId: number,
  opts: { nameRomaji?: string | null; superseded?: boolean } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO brands
       (brand_id, name, name_kanji, name_romaji, brewery_id, source, confidence, content_hash, superseded_at)
     VALUES ($1, $2, $3, $4, $5, 'sakenowa', null, $6, $7)`,
    [
      brandId,
      `name-${brandId}`,
      `蔵${brandId}`,
      opts.nameRomaji ?? null,
      BREWERY_ID,
      `hash-brand-${brandId}`,
      opts.superseded ? new Date() : null,
    ],
  )
}

async function seedChart(brandId: number): Promise<void> {
  await pool.query(
    `INSERT INTO flavor_charts (brand_id, f1, f2, f3, f4, f5, f6, source, confidence, content_hash)
     VALUES ($1, 0.72, 0.35, 0.25, 0.45, 0.55, 0.68, 'sakenowa', null, $2)`,
    [brandId, `hash-chart-${brandId}`],
  )
}

describe('getFlavorCandidatePoolFromPool', () => {
  it('returns charted live brands with names + numeric axes, excluding superseded and chartless', async () => {
    await seedBrewery()
    await seedBrand(LIVE_CHARTED, { nameRomaji: 'Dassai' })
    await seedChart(LIVE_CHARTED)
    await seedBrand(SUPERSEDED_CHARTED, { superseded: true })
    await seedChart(SUPERSEDED_CHARTED)
    await seedBrand(LIVE_NO_CHART) // deliberately no chart

    // Filter to our fixtures so the assertion is isolated from any other rows
    // in the shared container.
    const ours = (await getFlavorCandidatePoolFromPool(pool)).filter((c) =>
      BRAND_IDS.includes(c.brandId),
    )

    expect(ours).toHaveLength(1)
    const candidate = ours[0]!
    expect(candidate.brandId).toBe(LIVE_CHARTED)
    expect(candidate.nameJa).toBe(`蔵${LIVE_CHARTED}`)
    expect(candidate.nameRomaji).toBe('Dassai')
    // Axes are real numbers (pg returns NUMERIC as strings; the mapper converts).
    expect(typeof candidate.f1).toBe('number')
    expect(candidate.f1).toBeCloseTo(0.72, 4)
    expect(candidate.f6).toBeCloseTo(0.68, 4)
  })
})
