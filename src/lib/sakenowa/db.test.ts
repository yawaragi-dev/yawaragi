import { describe, expect, it, vi } from 'vitest'
import type { Pool, PoolClient } from 'pg'
import type { Brand } from '../schemas/brand'
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

// ---------------------------------------------------------------------------
// The single generic upsert driver that replaced the five hand-rolled
// Pg*DB classes. These pin the behaviour that used to be copy-pasted
// per class: the shared `transaction()` ACID unit (nested-tx reuse +
// rollback-swallow) and the COALESCE-romaji preservation rule in the
// chunked ON CONFLICT upsert. We exercise it once, through the brands
// factory, rather than re-asserting it for all five tables.
// ---------------------------------------------------------------------------

const aBrand: Brand = {
  brandId: 1,
  name: '麗人',
  nameKanji: '麗人',
  nameRomaji: null,
  breweryId: 49,
  source: 'sakenowa',
}

describe('PgUpsertDriver — upsert SQL', () => {
  it('preserves an existing name_romaji via COALESCE when the incoming row is NULL', async () => {
    const { pool, calls } = mockPool({})
    const db = makePgBrandsDB(pool)
    await db.upsertBrandsBatch([{ brand: aBrand, contentHash: 'h1' }])
    const insert = calls.find((c) => c.includes('INSERT INTO brands'))
    expect(insert).toBeDefined()
    // Non-key columns refresh from EXCLUDED; name_romaji uses COALESCE so
    // an ingest that skipped transliteration can't clobber a stored value.
    expect(insert).toMatch(/name_romaji\s*=\s*COALESCE\(EXCLUDED\.name_romaji,\s*brands\.name_romaji\)/i)
    expect(insert).toMatch(/ON CONFLICT \(brand_id\) DO UPDATE SET/i)
    expect(insert).toMatch(/updated_at\s*=\s*NOW\(\)/i)
  })

  it('is a no-op on empty input (issues no query)', async () => {
    const { pool, calls } = mockPool({})
    const db = makePgBrandsDB(pool)
    await db.upsertBrandsBatch([])
    expect(calls).toHaveLength(0)
  })
})

describe('PgUpsertDriver — transaction()', () => {
  it('reuses an in-flight PoolClient without opening a nested BEGIN', async () => {
    const calls: string[] = []
    // A PoolClient is detected by the presence of `release`. When the
    // factory is handed one, transaction() must run inline (one logical
    // unit) — no connect(), no BEGIN.
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql)
        return { rows: [] }
      }),
      release: vi.fn(),
    } as unknown as PoolClient
    const db = makePgBrandsDB(client)

    const result = await db.transaction(async (tx) => {
      expect(tx).toBe(db)
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(calls).not.toContain('BEGIN')
  })

  it('rolls back on a thrown callback and surfaces the original error, swallowing a rollback failure', async () => {
    const clientCalls: string[] = []
    const release = vi.fn()
    const client = {
      query: vi.fn(async (sql: string) => {
        clientCalls.push(sql)
        // The ROLLBACK itself fails — the original error must still win.
        if (sql === 'ROLLBACK') throw new Error('rollback exploded')
        return { rows: [] }
      }),
      release,
    } as unknown as PoolClient
    const pool = {
      connect: vi.fn(async () => client),
    } as unknown as Pool
    const db = makePgBrandsDB(pool)

    await expect(
      db.transaction(async () => {
        throw new Error('boom in callback')
      }),
    ).rejects.toThrow('boom in callback')

    expect(clientCalls).toEqual(['BEGIN', 'ROLLBACK'])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('commits and releases the client on success', async () => {
    const clientCalls: string[] = []
    const release = vi.fn()
    const client = {
      query: vi.fn(async (sql: string) => {
        clientCalls.push(sql)
        return { rows: [] }
      }),
      release,
    } as unknown as PoolClient
    const pool = {
      connect: vi.fn(async () => client),
    } as unknown as Pool
    const db = makePgBrandsDB(pool)

    await db.transaction(async () => 'done')

    expect(clientCalls).toEqual(['BEGIN', 'COMMIT'])
    expect(release).toHaveBeenCalledTimes(1)
  })
})
