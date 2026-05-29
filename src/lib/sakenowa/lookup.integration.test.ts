/**
 * Integration tests for the read-side `lookupBrandFromPool` helper.
 *
 * Exercises real Postgres via testcontainers (set up globally in
 * tests/integration/setup.ts). Seeds a fixture brand, asserts the
 * returned shape matches `Brand`, and confirms behavior on a missing
 * brandId.
 *
 * RLS coverage lives in src/lib/supabase/server-client.integration.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { lookupBrandFromPool } from './lookup'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set; the integration test global setup did not run')
}

const pool = new Pool({ connectionString: TEST_DATABASE_URL })

beforeAll(async () => {
  await pool.query('RESET ROLE')
})

afterAll(async () => {
  await pool.query('DELETE FROM brands WHERE brand_id IN ($1, $2)', [9001, 9002])
  await pool.end()
})

beforeEach(async () => {
  await pool.query('RESET ROLE')
  await pool.query('DELETE FROM brands WHERE brand_id IN ($1, $2)', [9001, 9002])
})

describe('lookupBrandFromPool', () => {
  it('returns null when the brandId does not exist', async () => {
    const result = await lookupBrandFromPool(9999, pool)
    expect(result).toBeNull()
  })

  it('returns a fully-shaped Brand for a seeded sakenowa row', async () => {
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Reijin', '麗人', 49, 'sakenowa', null, 'hash-fixture-9001'],
    )

    const brand = await lookupBrandFromPool(9001, pool)

    expect(brand).toEqual({
      brandId: 9001,
      name: 'Reijin',
      nameKanji: '麗人',
      breweryId: 49,
      source: 'sakenowa',
    })
  })

  it('round-trips confidence as a number when set', async () => {
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9002, 'Test', 'テスト', 1, 'llm_extracted', 0.75, 'hash-fixture-9002'],
    )

    const brand = await lookupBrandFromPool(9002, pool)

    expect(brand?.confidence).toBe(0.75)
    expect(brand?.source).toBe('llm_extracted')
  })
})
