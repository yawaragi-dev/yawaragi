/**
 * Migration 0020 (#451): which Sakenowa flavor tags each sake carries, the
 * ingest that replaces them, and Search's read of them.
 *
 * Real Postgres via testcontainers (tests/integration/setup.ts applies every
 * migration).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { makePgBrandFlavorTagsDB } from './db'
import { sakesTaggedWith } from './flavor-tag-search'
import { ingestBrandFlavorTags } from './ingestion-pipeline'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL not set — tests/integration/setup.ts should provide it')
}
const pool = new Pool({ connectionString: TEST_DATABASE_URL })

const BREWERY = 9701
const BRANDS = [9201, 9202, 9203, 9204] as const
const TAGS = [
  [9109, 'グレープフルーツ'],
  [9052, '柑橘'],
] as const

async function clean() {
  await pool.query('DELETE FROM brand_flavor_tags WHERE brand_id = ANY($1::int[])', [[...BRANDS]])
  await pool.query('DELETE FROM brands WHERE brand_id = ANY($1::int[])', [[...BRANDS]])
  await pool.query('DELETE FROM breweries WHERE brewery_id = $1', [BREWERY])
  await pool.query('DELETE FROM flavor_tags WHERE tag_id = ANY($1::int[])', [TAGS.map(([id]) => id)])
}

async function seed() {
  await pool.query(
    `INSERT INTO breweries (brewery_id, name, name_kanji, name_romaji, area_id, source, content_hash)
     VALUES ($1, '萬乗醸造', '萬乗醸造', 'Banjo Jozo', 23, 'sakenowa', 'h')`,
    [BREWERY],
  )
  const brands: [number, string, string][] = [
    [9201, '而今', 'Jikon'],
    [9202, '醸し人九平次', 'Kamoshibito Kuheiji'],
    [9203, '阿部勘', 'Abekan'],
    [9204, '旧銘柄', 'Old Name'],
  ]
  for (const [id, kanji, romaji] of brands) {
    await pool.query(
      `INSERT INTO brands (brand_id, name, name_kanji, name_romaji, brewery_id, source, content_hash)
       VALUES ($1, $2, $2, $3, $4, 'sakenowa', 'h')`,
      [id, kanji, romaji, BREWERY],
    )
  }
  await pool.query(`UPDATE brands SET superseded_at = now() WHERE brand_id = 9204`)
  for (const [id, name] of TAGS) {
    await pool.query(
      `INSERT INTO flavor_tags (tag_id, name, source, content_hash) VALUES ($1, $2, 'sakenowa', 'h')`,
      [id, name],
    )
  }
}

beforeEach(async () => {
  await pool.query('RESET ROLE')
  await clean()
  await seed()
})

afterAll(async () => {
  await pool.query('RESET ROLE')
  await clean()
  await pool.end()
})

describe('brand flavor tags (migration 0020)', () => {
  it('ingests Sakenowa pairs, then Search lists the tagged sakes A–Z, each once, live sakes only', async () => {
    const summary = await ingestBrandFlavorTags({
      client: {
        getBrandFlavorTags: async () => [
          { brandId: 9201, tagIds: [9109] },
          { brandId: 9202, tagIds: [9052, 9109] }, // both tags: listed once, under the first asked for
          { brandId: 9203, tagIds: [9052] },
          { brandId: 9204, tagIds: [9109] }, // superseded: never listed
          { brandId: 9999, tagIds: [9109] }, // not in the catalogue: dropped
        ],
      },
      db: makePgBrandFlavorTagsDB(pool),
    })
    // Only this file's rows count here; other suites may have their own brands.
    expect(summary.dropped).toBeGreaterThanOrEqual(1)

    const result = await sakesTaggedWith(
      [
        { tagId: 9109, kanji: 'グレープフルーツ' },
        { tagId: 9052, kanji: '柑橘' },
      ],
      pool,
    )

    expect(result.total).toBe(3)
    expect(result.matches.map((m) => [m.nameRomaji, m.tagKanji])).toEqual([
      ['Abekan', '柑橘'],
      ['Jikon', 'グレープフルーツ'],
      ['Kamoshibito Kuheiji', 'グレープフルーツ'],
    ])
    expect(result.matches[0].breweryRomaji).toBe('Banjo Jozo')
  })

  it('keeps the previous snapshot when a replace fails half way', async () => {
    const db = makePgBrandFlavorTagsDB(pool)
    await ingestBrandFlavorTags({
      client: { getBrandFlavorTags: async () => [{ brandId: 9201, tagIds: [9109] }] },
      db,
    })

    await expect(
      db.transaction(async (tx) => {
        await tx.replaceAll([{ brandId: 9201, tagId: 9109, position: 0, source: 'sakenowa' }]) // position must be > 0
      }),
    ).rejects.toThrow()

    const { rows } = await pool.query('SELECT brand_id FROM brand_flavor_tags WHERE brand_id = 9201')
    expect(rows).toHaveLength(1)
  })

  it('is not readable by the anon role', async () => {
    await pool.query('SET ROLE anon')
    await expect(pool.query('SELECT * FROM brand_flavor_tags')).rejects.toThrow()
    await pool.query('RESET ROLE')
  })
})
