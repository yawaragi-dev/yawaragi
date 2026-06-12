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
  findSakeByBrandOnlyFromPool,
  findSakeByBreweryOnlyFromPool,
  findSakeByExtractionFromPool,
  listRankingFromPool,
  lookupBrandFromPool,
  lookupBreweryByBrandFromPool,
  lookupFlavorChartFromPool,
} from './lookup'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set; the integration test global setup did not run')
}

const pool = new Pool({ connectionString: TEST_DATABASE_URL })

// 9003 used by the 2026-06-12 mono-brand-preference test (Sawanotsuru
// shape) — the brewery has 3 brands so we need a third fixture id in
// the cleanup set; without it the FK from brands.brewery_id blocks
// brewery deletion in subsequent tests.
const FIXTURE_BRAND_IDS = [9001, 9002, 9003] as const
const FIXTURE_BREWERY_IDS = [9501, 9502] as const

async function cleanFixtures(): Promise<void> {
  // FK direction: rankings + flavor_charts → brands → breweries. Delete
  // children first. flavor_charts ON DELETE CASCADE makes the explicit
  // DELETE belt-and-braces, but it also covers orphan rows that future
  // tests might create without a matching brand.
  await pool.query('DELETE FROM flavor_charts WHERE brand_id = ANY($1::int[])', [
    [...FIXTURE_BRAND_IDS],
  ])
  await pool.query('DELETE FROM rankings WHERE brand_id = ANY($1::int[])', [
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
      nameRomaji: null,
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
      nameRomaji: null,
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

describe('listRankingFromPool', () => {
  async function seedRankingFixture(): Promise<void> {
    await seedBrewery({ breweryId: 9501 })
    await seedBrewery({ breweryId: 9502 })
    await pool.query(
      `INSERT INTO brands (brand_id, name, name_kanji, brewery_id, source, content_hash)
       VALUES ($1, 'Reijin', '麗人', 9501, 'sakenowa', 'h1'),
              ($2, 'Other',  '別',  9502, 'sakenowa', 'h2')`,
      [9001, 9002],
    )
    await pool.query(
      `INSERT INTO rankings (kind, area_id, rank, brand_id, score, source)
       VALUES
         ('overall', NULL, 1, $1, 4.4, 'sakenowa'),
         ('overall', NULL, 2, $2, 4.1, 'sakenowa'),
         ('area',    20,   1, $1, 4.4, 'sakenowa'),
         ('area',    20,   2, $2, 4.0, 'sakenowa')`,
      [9001, 9002],
    )
  }

  it('returns the top-N overall rows in rank order', async () => {
    await seedRankingFixture()
    const rows = await listRankingFromPool({ kind: 'overall', limit: 10 }, pool)
    expect(rows.map((r) => r.rank)).toEqual([1, 2])
    expect(rows[0]).toMatchObject({
      kind: 'overall',
      areaId: null,
      brandId: 9001,
      source: 'sakenowa',
    })
    expect(rows[0].score).toBeCloseTo(4.4)
  })

  it('honours limit', async () => {
    await seedRankingFixture()
    const rows = await listRankingFromPool({ kind: 'overall', limit: 1 }, pool)
    expect(rows).toHaveLength(1)
    expect(rows[0].rank).toBe(1)
  })

  it("returns the area-scoped rows when kind='area' and areaId set", async () => {
    await seedRankingFixture()
    const rows = await listRankingFromPool({ kind: 'area', limit: 10, areaId: 20 }, pool)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.kind === 'area' && r.areaId === 20)).toBe(true)
  })

  it("throws when kind='area' is requested without an areaId", async () => {
    await expect(
      listRankingFromPool({ kind: 'area', limit: 10 }, pool),
    ).rejects.toThrow(/requires an areaId/)
  })

  it('returns [] when limit is 0 (avoids a needless query)', async () => {
    const rows = await listRankingFromPool({ kind: 'overall', limit: 0 }, pool)
    expect(rows).toEqual([])
  })

  it('returns [] for an areaId with no rankings rather than throwing', async () => {
    await seedRankingFixture()
    const rows = await listRankingFromPool({ kind: 'area', limit: 10, areaId: 99 }, pool)
    expect(rows).toEqual([])
  })
})

describe('findSakeByExtractionFromPool', () => {
  // Per the slice spec (#106): exact-match (happy path) and no-match are
  // covered here. Ambiguous-match seeding is deferred to S4 — the union
  // arm exists in the implementation today so the result UI compiles
  // closed, but the seeded duplicate-name fixtures land with S4.

  it('returns {kind: "exact"} with the single matched Brand when both kanji join', async () => {
    // Mirror the PRD's Dassai happy path: 獺祭 (the sake) by 旭酒造 (the brewery).
    // PRD #105 §"Sakenowa lookup for extraction" — exact kanji match on
    // brands.name_kanji × breweries.name_kanji.
    await seedBrewery({
      breweryId: 9501,
      name: 'Asahi Shuzo',
      nameKanji: '旭酒造',
      areaId: 35,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Dassai', '獺祭', 9501, 'sakenowa', null, 'hash-dassai-9001'],
    )

    const result = await findSakeByExtractionFromPool(
      { nameJa: '獺祭', breweryJa: '旭酒造' },
      pool,
    )

    expect(result.kind).toBe('exact')
    if (result.kind !== 'exact') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toEqual({
      brandId: 9001,
      name: 'Dassai',
      nameKanji: '獺祭',
      nameRomaji: null,
      breweryId: 9501,
      source: 'sakenowa',
    })
  })

  it('returns {kind: "no_match"} when neither kanji pair matches any seeded brand', async () => {
    // Seed something else so the query has at least one brand row to
    // compare against, then look up a pair that doesn't exist.
    await seedBrandWithBrewery(9001, 9501)

    const query = { nameJa: '存在しない酒', breweryJa: '架空酒造' }
    const result = await findSakeByExtractionFromPool(query, pool)

    expect(result.kind).toBe('no_match')
    if (result.kind !== 'no_match') throw new Error('unreachable; for narrowing only')
    // The query is echoed back so the UI can render "we couldn't find X by Y".
    expect(result.query).toEqual(query)
  })

  it('returns {kind: "matched_brand_only"} when first-pass misses but brand-only fallback finds a unique brand (#123)', async () => {
    // The motivating #123 case: 蔵王 bottle, model returned a
    // hallucinated brewery `宮鉄酒造`. The brand kanji 蔵王 still
    // identifies a unique Sakenowa row. Fallback must succeed AND
    // surface the divergence so the UI can render honest copy
    // rather than silently navigating to a brand whose brewery
    // doesn't match what the visitor saw on the label.
    await seedBrewery({
      breweryId: 9501,
      name: 'Zao Shuzo',
      nameKanji: '蔵王酒造',
      areaId: 6,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Zao', '蔵王', 9501, 'sakenowa', null, 'hash-zao-9001'],
    )

    const result = await findSakeByExtractionFromPool(
      { nameJa: '蔵王', breweryJa: '宮鉄酒造' },
      pool,
    )

    expect(result.kind).toBe('matched_brand_only')
    if (result.kind !== 'matched_brand_only') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9001, nameKanji: '蔵王' })
    expect(result.brewery).toMatchObject({ breweryId: 9501, nameKanji: '蔵王酒造' })
    expect(result.breweryDivergence).toEqual({
      extracted: '宮鉄酒造',
      stored: '蔵王酒造',
    })
    expect(result.query).toEqual({ nameJa: '蔵王', breweryJa: '宮鉄酒造' })
  })

  it('returns {kind: "ambiguous"} when brand-only fallback finds the same brand kanji across multiple breweries (#123)', async () => {
    // Two breweries each register a brand named 菊姫 — same kanji,
    // different brewers. First-pass joins on a (presumed wrong)
    // brewery and misses; second pass finds both candidates and
    // routes to ambiguous so the visitor can disambiguate.
    await seedBrewery({ breweryId: 9501, name: 'Asahi Shuzo', nameKanji: '旭酒造', areaId: 35 })
    await seedBrewery({ breweryId: 9502, name: 'Kikuhime Brewers', nameKanji: '菊姫合資会社', areaId: 17 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)`,
      [
        9001, 'Kikuhime', '菊姫', 9501, 'sakenowa', null, 'hash-kikuhime-9001',
        9002, 'Kikuhime', '菊姫', 9502, 'sakenowa', null, 'hash-kikuhime-9002',
      ],
    )

    const result = await findSakeByExtractionFromPool(
      { nameJa: '菊姫', breweryJa: '存在しない酒造' },
      pool,
    )

    expect(result.kind).toBe('ambiguous')
    if (result.kind !== 'ambiguous') throw new Error('unreachable; for narrowing only')
    expect(result.candidates.map((c) => c.brandId).sort()).toEqual([9001, 9002])
    expect(result.query).toEqual({ nameJa: '菊姫', breweryJa: '存在しない酒造' })
  })

  it('falls through to Latin-name lookup when the model returns a Latin brand (2026-06-12 script-coverage)', async () => {
    // 110 Sakenowa brands are Latin-only (`Shangri-la`, `UMAMI`,
    // `Highland`, etc). When the model returns the Latin form
    // (which the 2026-06-12 prompt update explicitly allows) the
    // kanji + kana passes all miss, then the 5th-pass Latin lookup
    // catches it via `LOWER(brands.name) = LOWER($1)`.
    await seedBrewery({ breweryId: 9501, name: 'Test', nameKanji: 'テスト酒造', areaId: 1 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      // Sakenowa publishes the Latin brand name in the `name` column.
      // `name_kanji` defaults to the same value when there's no
      // Japanese form.
      [9001, 'Shangri-la', 'Shangri-la', 9501, 'sakenowa', null, 'hash-latin-brand-9001'],
    )

    const result = await findSakeByExtractionFromPool(
      // Brewery_ja deliberately does NOT match the seeded brewery,
      // so passes 1–4 (which all join through brewery) all miss and
      // the chain falls through to the 5th-pass Latin lookup. That
      // pass matches the seeded brand 9001 case-insensitively
      // (SHANGRI-LA → Shangri-la).
      { nameJa: 'SHANGRI-LA', breweryJa: '存在しない酒造' },
      pool,
    )

    expect(result.kind).toBe('matched_brand_only')
    if (result.kind !== 'matched_brand_only') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9001, name: 'Shangri-la' })
    // The divergence's `extracted` field carries the visitor's
    // original (unmatched) brewery_ja so the divergence card
    // surfaces the gap honestly.
    expect(result.breweryDivergence.extracted).toBe('存在しない酒造')
    expect(result.breweryDivergence.stored).toBe('テスト酒造')
  })

  it('matches across hiragana ↔ katakana for kana brands (2026-06-12 script-coverage)', async () => {
    // Sakenowa publishes 169 hiragana-only and 35 katakana-only
    // brands. If the model returns one form and the catalogue
    // stores the other (or vice versa), the kana-cross expansion
    // bridges them.
    await seedBrewery({ breweryId: 9501, name: 'Test', nameKanji: 'テスト酒造', areaId: 1 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      // Sakenowa stores the brand in hiragana.
      [9001, 'Umami', 'うまみ', 9501, 'sakenowa', null, 'hash-kana-cross-9001'],
    )

    const result = await findSakeByExtractionFromPool(
      // Model returned the katakana form.
      { nameJa: 'ウマミ', breweryJa: 'テスト酒造' },
      pool,
    )

    expect(result.kind).toBe('exact')
    if (result.kind !== 'exact') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9001, nameKanji: 'うまみ' })
  })

  it('returns {kind: "matched_brewery_only"} when first-pass + brand-only both miss but brewery-only finds a mono-brand brewery', async () => {
    // The motivating real-world case: Takashimizu bottle, model
    // returned brewery 高清水酒造 correctly but hallucinated brand
    // 寺田 (a real surname, not Takashimizu's brand line). Brand-only
    // fallback misses (no Sakenowa brand is 寺田); brewery-only third
    // pass finds the single Takashimizu brand line and surfaces the
    // brand divergence.
    await seedBrewery({
      breweryId: 9501,
      name: 'Takashimizu Shuzo',
      nameKanji: '高清水酒造',
      areaId: 5,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Takashimizu', '高清水', 9501, 'sakenowa', null, 'hash-takashimizu-9001'],
    )

    const result = await findSakeByExtractionFromPool(
      { nameJa: '寺田', breweryJa: '高清水酒造' },
      pool,
    )

    expect(result.kind).toBe('matched_brewery_only')
    if (result.kind !== 'matched_brewery_only') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9001, nameKanji: '高清水' })
    expect(result.brewery).toMatchObject({ breweryId: 9501, nameKanji: '高清水酒造' })
    expect(result.brandDivergence).toEqual({
      extracted: '寺田',
      stored: '高清水',
    })
    expect(result.query).toEqual({ nameJa: '寺田', breweryJa: '高清水酒造' })
  })

  it('returns {kind: "ambiguous"} when brewery-only finds multiple brands under a multi-brand brewery', async () => {
    // 旭酒造 (Asahi Shuzo) makes more than one Sakenowa brand line.
    // Model returned a hallucinated brand → brand-only fallback
    // misses → brewery-only finds 2+ candidates → ambiguous (S4
    // PR B's disambiguation list takes it from here).
    await seedBrewery({ breweryId: 9501, name: 'Asahi Shuzo', nameKanji: '旭酒造', areaId: 35 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)`,
      [
        9001, 'Dassai', '獺祭', 9501, 'sakenowa', null, 'hash-dassai-multibrand-9001',
        9002, 'Sakura', '桜', 9501, 'sakenowa', null, 'hash-sakura-multibrand-9002',
      ],
    )

    const result = await findSakeByExtractionFromPool(
      { nameJa: '架空の銘柄', breweryJa: '旭酒造' },
      pool,
    )

    expect(result.kind).toBe('ambiguous')
    if (result.kind !== 'ambiguous') throw new Error('unreachable; for narrowing only')
    expect(result.candidates.map((c) => c.brandId).sort()).toEqual([9001, 9002])
  })

  it('returns {kind: "matched_brand_only"} via 4th-pass field-swap (2026-06-12 Sugitama shape)', async () => {
    // First three passes all miss; the brewery_ja field actually
    // holds the brand name with `酒造` appended. 4th pass calls
    // brand-only on `extraction.brewery_ja` (杉玉酒造) — suffix
    // expansion adds `杉玉` as a candidate — matches the seeded
    // brand. Result echoes back the original query so the
    // divergence shows the visitor's original brewery_ja.
    await seedBrewery({
      breweryId: 9501,
      name: 'Momokawa',
      nameKanji: '桃川',
      areaId: 2,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Sugitama', '杉玉', 9501, 'sakenowa', null, 'hash-sugitama-fieldswap-9001'],
    )

    const result = await findSakeByExtractionFromPool(
      // Real model output for the 2026-06-12 22175.jpg trace:
      // brand `崇麗` (junk) + brewery `杉玉酒造` (brand+酒造).
      { nameJa: '崇麗', breweryJa: '杉玉酒造' },
      pool,
    )

    expect(result.kind).toBe('matched_brand_only')
    if (result.kind !== 'matched_brand_only') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9001, nameKanji: '杉玉' })
    expect(result.brewery).toMatchObject({ breweryId: 9501, nameKanji: '桃川' })
    expect(result.breweryDivergence).toEqual({
      extracted: '杉玉酒造',
      stored: '桃川',
    })
    // Echo back the ORIGINAL query, not the field-swapped one.
    expect(result.query).toEqual({ nameJa: '崇麗', breweryJa: '杉玉酒造' })
  })

  it('returns {kind: "ambiguous"} via 4th-pass when the field-swap brand has multiple breweries (Hakushika shape)', async () => {
    // Real 2026-06-12 trace on `22176.jpg`: model returned
    // `name_ja: '山田錦'` (rice variety!) and `brewery_ja: '白鹿'`
    // (the actual brand). Sakenowa has two breweries that produce
    // 白鹿. 4th pass → ambiguous, which is what we want.
    await seedBrewery({ breweryId: 9501, name: 'Ishioka', nameKanji: '石岡酒造', areaId: 8 })
    await seedBrewery({ breweryId: 9502, name: 'Tatsuuma', nameKanji: '辰馬本家酒造', areaId: 28 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)`,
      [
        9001, 'Hakushika', '白鹿', 9501, 'sakenowa', null, 'hash-hakushika-multi-9001',
        9002, 'Hakushika', '白鹿', 9502, 'sakenowa', null, 'hash-hakushika-multi-9002',
      ],
    )

    const result = await findSakeByExtractionFromPool(
      { nameJa: '山田錦', breweryJa: '白鹿' },
      pool,
    )

    expect(result.kind).toBe('ambiguous')
    if (result.kind !== 'ambiguous') throw new Error('unreachable; for narrowing only')
    expect(result.candidates.map((c) => c.brandId).sort()).toEqual([9001, 9002])
    expect(result.query).toEqual({ nameJa: '山田錦', breweryJa: '白鹿' })
  })
})

describe('findSakeByBreweryOnlyFromPool', () => {
  // Standalone brewery-only seam. Called directly by scan-action.ts
  // when the single-character-hallucination guard fires — the brand
  // is junk but the brewery may still resolve. Mirrors the third-pass
  // arm of `findSakeByExtractionFromPool` but addressable on its
  // own.

  it('returns {kind: "matched_brewery_only"} for a mono-brand brewery', async () => {
    // Same Takashimizu fixture as the brewery-only branch of
    // `findSakeByExtractionFromPool` — exercised here through the
    // standalone seam to lock in the contract scan-action depends on.
    await seedBrewery({
      breweryId: 9501,
      name: 'Takashimizu Shuzo',
      nameKanji: '高清水酒造',
      areaId: 5,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Takashimizu', '高清水', 9501, 'sakenowa', null, 'hash-takashimizu-9001'],
    )

    const result = await findSakeByBreweryOnlyFromPool(
      // Single-char garbage name_ja, real brewery kanji — the exact
      // shape the single-char guard in scan-action surfaces.
      { nameJa: '紀', breweryJa: '高清水酒造' },
      pool,
    )

    expect(result.kind).toBe('matched_brewery_only')
    if (result.kind !== 'matched_brewery_only') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9001, nameKanji: '高清水' })
    expect(result.brewery).toMatchObject({ breweryId: 9501, nameKanji: '高清水酒造' })
    expect(result.brandDivergence).toEqual({
      extracted: '紀',
      stored: '高清水',
    })
  })

  it('returns {kind: "ambiguous"} for a multi-brand brewery', async () => {
    await seedBrewery({ breweryId: 9501, name: 'Asahi Shuzo', nameKanji: '旭酒造', areaId: 35 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)`,
      [
        9001, 'Dassai', '獺祭', 9501, 'sakenowa', null, 'hash-brewery-only-multi-9001',
        9002, 'Sakura', '桜', 9501, 'sakenowa', null, 'hash-brewery-only-multi-9002',
      ],
    )

    const result = await findSakeByBreweryOnlyFromPool(
      { nameJa: '幻', breweryJa: '旭酒造' },
      pool,
    )

    expect(result.kind).toBe('ambiguous')
    if (result.kind !== 'ambiguous') throw new Error('unreachable; for narrowing only')
    expect(result.candidates.map((c) => c.brandId).sort()).toEqual([9001, 9002])
  })

  it('prefers the same-name brand under a mono-brand brewery (2026-06-12 Sawanotsuru shape)', async () => {
    // Real 22177 trace: bottle is 沢の鶴 純米酒 by 沢の鶴 brewery
    // (Nada, Kobe). Sakenowa Brewery 576 has multiple brands
    // including Brand 2008 (same name `沢の鶴`) and others like
    // 鶴の舞, 酒道粋人. The model returned the brewery correctly
    // (`沢の鶴`) but invented a brand (`八仙`) — common mono-brand-
    // brewery failure shape.
    //
    // Pre-fix: brewery-only finds 3 brands, routes to ambiguous,
    // visitor sees confusing list. The LIMIT 2 + ORDER BY brand_id
    // bug even meant Brand 2008 was off the end of the candidates.
    // Post-fix: same-name preference picks the main brand.
    await seedBrewery({
      breweryId: 9501,
      name: 'Sawanotsuru',
      nameKanji: '沢の鶴',
      areaId: 28,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7),
         ($8, $9, $10, $11, $12, $13, $14),
         ($15, $16, $17, $18, $19, $20, $21)`,
      [
        9001, 'Tsurunomai', '鶴の舞', 9501, 'sakenowa', null, 'hash-monobrand-tsurunomai',
        9002, 'Shudosuijin', '酒道粋人', 9501, 'sakenowa', null, 'hash-monobrand-shudosuijin',
        // Same-name main brand seeded LAST so brand_id is the
        // highest of the three — pre-fix it would have been dropped
        // by the LIMIT 2 + ORDER BY brand_id.
        9003, 'Sawanotsuru', '沢の鶴', 9501, 'sakenowa', null, 'hash-monobrand-sawanotsuru-main',
      ],
    )

    const result = await findSakeByBreweryOnlyFromPool(
      // Real model output: junk brand, correct brewery.
      { nameJa: '八仙', breweryJa: '沢の鶴' },
      pool,
    )

    expect(result.kind).toBe('matched_brewery_only')
    if (result.kind !== 'matched_brewery_only') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9003, nameKanji: '沢の鶴' })
    expect(result.brewery).toMatchObject({ breweryId: 9501, nameKanji: '沢の鶴' })
    expect(result.brandDivergence).toEqual({
      extracted: '八仙',
      stored: '沢の鶴',
    })
  })

  it('falls through to ambiguous when 2+ brands share the brewery name across different breweries', async () => {
    // Edge case: two breweries each named `白鹿` (one Ibaraki, one
    // Hyogo) where each has a main brand also called `白鹿`. The
    // same-name preference would have two candidates — we can't
    // unambiguously pick, so we fall through to ambiguous and let
    // the disambiguation UI handle it.
    await seedBrewery({ breweryId: 9501, name: 'Brewery A', nameKanji: '白鹿', areaId: 8 })
    await seedBrewery({ breweryId: 9502, name: 'Brewery B', nameKanji: '白鹿', areaId: 28 })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)`,
      [
        9001, 'Hakushika', '白鹿', 9501, 'sakenowa', null, 'hash-same-name-collide-9001',
        9002, 'Hakushika', '白鹿', 9502, 'sakenowa', null, 'hash-same-name-collide-9002',
      ],
    )

    const result = await findSakeByBreweryOnlyFromPool(
      { nameJa: '幻', breweryJa: '白鹿' },
      pool,
    )

    expect(result.kind).toBe('ambiguous')
    if (result.kind !== 'ambiguous') throw new Error('unreachable; for narrowing only')
    expect(result.candidates.map((c) => c.brandId).sort()).toEqual([9001, 9002])
  })

  it('returns {kind: "no_match"} when the brewery kanji is not in Sakenowa', async () => {
    // Don't seed anything — query against the brewery kanji of a
    // brewery that doesn't exist.
    const result = await findSakeByBreweryOnlyFromPool(
      { nameJa: '幻', breweryJa: '架空酒造' },
      pool,
    )
    expect(result.kind).toBe('no_match')
  })

  it('strips the operational suffix when the input ends with 酒造 (2026-06-12 Takashimizu fix)', async () => {
    // The 2026-06-11 fix shipped the field-swap rescue but the
    // lookup queried `extraction.brewery_ja` verbatim — for a
    // Takashimizu bottle that's `高清水酒造`. Sakenowa stores the
    // brand as `高清水` (no suffix). expandPossibleBrandVariants
    // now adds the stem so this lookup hits.
    await seedBrewery({
      breweryId: 9501,
      name: 'Akita Shurui Seizo',
      nameKanji: '秋田酒類製造',
      areaId: 5,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Takashimizu', '高清水', 9501, 'sakenowa', null, 'hash-takashimizu-suffix-9001'],
    )

    const result = await findSakeByBrandOnlyFromPool(
      // Query with the 酒造 suffix the model added — stem expansion
      // strips it and the lookup finds 高清水.
      { nameJa: '高清水酒造', breweryJa: '高清水酒造' },
      pool,
    )

    expect(result.kind).toBe('matched_brand_only')
    if (result.kind !== 'matched_brand_only') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9001, nameKanji: '高清水' })
  })

  it('matches via brand-only when called with a field-swap query (2026-06-11 Takashimizu shape)', async () => {
    // Field-swap: model returned a hallucinated `name_ja` but put
    // the real brand `高清水` in `brewery_ja`. scan-action.ts calls
    // `findSakeByBrandOnly({ nameJa: extraction.brewery_ja, … })`
    // after the brewery-only fallback misses. If `高清水` exists as
    // a brand in Sakenowa, this seam finds it under its actual
    // brewery (`秋田酒類製造`) and surfaces matched_brand_only with
    // brewery-divergence semantics: extracted = what the model put
    // in the brewery field (the brand itself), stored = the
    // catalogue brewery.
    await seedBrewery({
      breweryId: 9501,
      name: 'Akita Shurui Seizo',
      nameKanji: '秋田酒類製造',
      areaId: 5,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Takashimizu', '高清水', 9501, 'sakenowa', null, 'hash-takashimizu-fieldswap-9001'],
    )

    const result = await findSakeByBrandOnlyFromPool(
      // Field-swap shape: action calls with nameJa = extraction.brewery_ja
      { nameJa: '高清水', breweryJa: '高清水' },
      pool,
    )

    expect(result.kind).toBe('matched_brand_only')
    if (result.kind !== 'matched_brand_only') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9001, nameKanji: '高清水' })
    expect(result.brewery).toMatchObject({ breweryId: 9501, nameKanji: '秋田酒類製造' })
    expect(result.breweryDivergence).toEqual({
      extracted: '高清水',
      stored: '秋田酒類製造',
    })
  })

  it('matches when the model dropped the 酒造 operational suffix (2026-06-11 Takashimizu shape)', async () => {
    // Sakenowa stores `高清水酒造`. Model returned `高清水` (no
    // suffix). `expandBreweryVariants` should add the 酒造 suffix
    // candidate so the lookup still finds the canonical brewery.
    await seedBrewery({
      breweryId: 9501,
      name: 'Takashimizu Shuzo',
      nameKanji: '高清水酒造',
      areaId: 5,
    })
    await pool.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [9001, 'Takashimizu', '高清水', 9501, 'sakenowa', null, 'hash-takashimizu-no-suffix-9001'],
    )

    const result = await findSakeByBreweryOnlyFromPool(
      { nameJa: '斗', breweryJa: '高清水' },
      pool,
    )

    expect(result.kind).toBe('matched_brewery_only')
    if (result.kind !== 'matched_brewery_only') throw new Error('unreachable; for narrowing only')
    expect(result.sake).toMatchObject({ brandId: 9001, nameKanji: '高清水' })
    expect(result.brewery).toMatchObject({ breweryId: 9501, nameKanji: '高清水酒造' })
    expect(result.brandDivergence).toEqual({
      extracted: '斗',
      stored: '高清水',
    })
  })
})
