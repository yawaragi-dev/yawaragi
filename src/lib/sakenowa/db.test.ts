import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { makePgBrandsDB, makePgBreweriesDB } from './db'

/**
 * Targeted unit coverage for the SQL-level behaviour of the
 * `getExistingBrand/BreweryHashes` methods — specifically the
 * romaji-backfill sentinel that reclassifies pre-migration-0010
 * rows as "updated" on the next ingest. Integration coverage on a
 * real Postgres lives in `lookup.integration.test.ts` (testcontainers);
 * this file is just for the read-side SQL shape.
 *
 * A real `pg.Pool` is mocked at the `.query()` boundary — we don't
 * need a database, we just need the SQL string + the row mapping.
 */

function mockPool(
  rowsFor: Record<string, Array<Record<string, unknown>>>,
): { pool: Pool; calls: string[] } {
  const calls: string[] = []
  const pool = {
    query: vi.fn(async (sql: string) => {
      calls.push(sql)
      // Whichever fixture matches a substring of the SQL — the first
      // one wins. Tests build their own fixtures keyed on a
      // distinctive substring.
      for (const [needle, rows] of Object.entries(rowsFor)) {
        if (sql.includes(needle)) return { rows }
      }
      return { rows: [] }
    }),
  } as unknown as Pool
  return { pool, calls }
}

describe('getExistingBrandHashes — romaji backfill sentinel', () => {
  it('substitutes the backfill sentinel for rows where name_romaji IS NULL', async () => {
    const { pool } = mockPool({
      'FROM brands': [
        { brand_id: 1, content_hash: 'real-hash-1' },
        { brand_id: 2, content_hash: '__needs_romaji_backfill__' },
      ],
    })
    const db = makePgBrandsDB(pool)
    const result = await db.getExistingBrandHashes()
    expect(result.get(1)).toBe('real-hash-1')
    expect(result.get(2)).toBe('__needs_romaji_backfill__')
  })

  it('emits SQL that gates the sentinel on `name_romaji IS NULL`', async () => {
    const { pool, calls } = mockPool({ 'FROM brands': [] })
    const db = makePgBrandsDB(pool)
    await db.getExistingBrandHashes()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/name_romaji\s+IS\s+NULL/i)
    expect(calls[0]).toMatch(/__needs_romaji_backfill__/)
  })
})

describe('getExistingBreweryHashes — romaji backfill sentinel', () => {
  it('substitutes the sentinel for rows with NULL romaji AND non-empty kanji', async () => {
    const { pool } = mockPool({
      'FROM breweries': [
        { brewery_id: 49, content_hash: 'real-hash-49' },
        { brewery_id: 100, content_hash: '__needs_romaji_backfill__' },
      ],
    })
    const db = makePgBreweriesDB(pool)
    const result = await db.getExistingBreweryHashes()
    expect(result.get(49)).toBe('real-hash-49')
    expect(result.get(100)).toBe('__needs_romaji_backfill__')
  })

  it('SQL guards the sentinel with length(name_kanji) > 0 so placeholder rows are NOT marked for backfill', async () => {
    const { pool, calls } = mockPool({ 'FROM breweries': [] })
    const db = makePgBreweriesDB(pool)
    await db.getExistingBreweryHashes()
    expect(calls).toHaveLength(1)
    // Both clauses must appear in the same CASE branch — placeholder
    // breweries (empty name_kanji + NULL romaji) should NOT get
    // reclassified, because their romaji is permanently NULL by design.
    expect(calls[0]).toMatch(/name_romaji\s+IS\s+NULL/i)
    expect(calls[0]).toMatch(/length\(name_kanji\)\s*>\s*0/i)
    expect(calls[0]).toMatch(/__needs_romaji_backfill__/)
  })
})
