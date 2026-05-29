/**
 * Database-shaped contract the ingestion pipeline depends on.
 *
 * The pipeline never imports pg directly. `PgBrandsDB` wraps a real pg.Pool
 * for production; tests pass an in-memory fake. `transaction()` lets the
 * pipeline scope all writes to a single ACID unit — failure-aborts (no
 * partial writes) follow from a real Postgres ROLLBACK in production and
 * from an explicit no-commit semantic in the fake.
 *
 * NOTE: deliberately no `import 'server-only'` here. `db.ts` is imported by
 * the CLI scripts (`scripts/ingest-sakenowa.ts` via tsx, which has no
 * `react-server` condition and would crash on the server-only stub). The
 * meaningful protection lives at `src/lib/supabase/server-client.ts`, which
 * is the entry that touches env / secrets. db.ts on its own only handles
 * an injected pg client and pure data shaping.
 */
import type { Pool, PoolClient } from 'pg'
import type { Brand } from '../schemas/brand'
import type { Brewery } from '../schemas/brewery'
import type { ProvenanceSource } from '../schemas/with-provenance'

export interface BrandUpsert {
  brand: Brand
  contentHash: string
}

/**
 * Called after each PG-side chunk write completes. Argument is the
 * number of rows persisted by that one statement (i.e. chunk size).
 * Callers compose this into cumulative progress.
 */
export type BatchProgress = (rowsThisChunk: number) => void

export interface BrandsDB {
  getExistingBrandHashes(): Promise<Map<number, string>>
  upsertBrandsBatch(rows: readonly BrandUpsert[], onChunk?: BatchProgress): Promise<void>
  transaction<T>(fn: (tx: BrandsDB) => Promise<T>): Promise<T>
}

// Postgres caps placeholders at 65535/query; 7 placeholders per brand row
// → ~9362 rows max. We pick 500 as a safety margin that also bounds the
// SQL-string size and memory footprint per statement. One batch fits the
// Phase 2 row counts (1733 breweries, 3167 brands) in 4-7 statements.
const BATCH_SIZE = 500

class PgBrandsDB implements BrandsDB {
  constructor(private readonly executor: Pool | PoolClient) {}

  async getExistingBrandHashes(): Promise<Map<number, string>> {
    const { rows } = await this.executor.query<{
      brand_id: number
      content_hash: string
    }>('SELECT brand_id, content_hash FROM brands')
    return new Map(rows.map((r) => [r.brand_id, r.content_hash]))
  }

  async upsertBrandsBatch(
    rows: readonly BrandUpsert[],
    onChunk?: BatchProgress,
  ): Promise<void> {
    if (rows.length === 0) return
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const chunk = rows.slice(start, start + BATCH_SIZE)
      const placeholders: string[] = []
      const values: unknown[] = []
      for (const { brand, contentHash } of chunk) {
        const i = values.length
        // 7 placeholders + literal NOW() for updated_at
        placeholders.push(
          `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, NOW())`,
        )
        values.push(
          brand.brandId,
          brand.name,
          brand.nameKanji,
          brand.breweryId,
          brand.source,
          brand.confidence ?? null,
          contentHash,
        )
      }
      await this.executor.query(
        `INSERT INTO brands
           (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash, updated_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (brand_id) DO UPDATE SET
           name         = EXCLUDED.name,
           name_kanji   = EXCLUDED.name_kanji,
           brewery_id   = EXCLUDED.brewery_id,
           source       = EXCLUDED.source,
           confidence   = EXCLUDED.confidence,
           content_hash = EXCLUDED.content_hash,
           updated_at   = NOW()`,
        values,
      )
      onChunk?.(chunk.length)
    }
  }

  async transaction<T>(fn: (tx: BrandsDB) => Promise<T>): Promise<T> {
    // Nested transactions: if we were handed a PoolClient already inside a
    // BEGIN, reuse it (one logical unit). Detect via the presence of `release`.
    if ('release' in this.executor) {
      return fn(this)
    }
    const client = await (this.executor as Pool).connect()
    try {
      await client.query('BEGIN')
      const result = await fn(new PgBrandsDB(client))
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {
        /* swallow rollback failure; surface the original */
      })
      throw err
    } finally {
      client.release()
    }
  }
}

export function makePgBrandsDB(pool: Pool): BrandsDB {
  return new PgBrandsDB(pool)
}

export interface BreweryUpsert {
  brewery: Brewery
  contentHash: string
}

export interface BreweriesDB {
  getExistingBreweryHashes(): Promise<Map<number, string>>
  upsertBreweriesBatch(rows: readonly BreweryUpsert[], onChunk?: BatchProgress): Promise<void>
  transaction<T>(fn: (tx: BreweriesDB) => Promise<T>): Promise<T>
}

class PgBreweriesDB implements BreweriesDB {
  constructor(private readonly executor: Pool | PoolClient) {}

  async getExistingBreweryHashes(): Promise<Map<number, string>> {
    const { rows } = await this.executor.query<{
      brewery_id: number
      content_hash: string
    }>('SELECT brewery_id, content_hash FROM breweries')
    return new Map(rows.map((r) => [r.brewery_id, r.content_hash]))
  }

  async upsertBreweriesBatch(
    rows: readonly BreweryUpsert[],
    onChunk?: BatchProgress,
  ): Promise<void> {
    if (rows.length === 0) return
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const chunk = rows.slice(start, start + BATCH_SIZE)
      const placeholders: string[] = []
      const values: unknown[] = []
      for (const { brewery, contentHash } of chunk) {
        const i = values.length
        placeholders.push(
          `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, NOW())`,
        )
        values.push(
          brewery.breweryId,
          brewery.name,
          brewery.nameKanji,
          brewery.areaId,
          brewery.source,
          brewery.confidence ?? null,
          contentHash,
        )
      }
      await this.executor.query(
        `INSERT INTO breweries
           (brewery_id, name, name_kanji, area_id, source, confidence, content_hash, updated_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (brewery_id) DO UPDATE SET
           name         = EXCLUDED.name,
           name_kanji   = EXCLUDED.name_kanji,
           area_id      = EXCLUDED.area_id,
           source       = EXCLUDED.source,
           confidence   = EXCLUDED.confidence,
           content_hash = EXCLUDED.content_hash,
           updated_at   = NOW()`,
        values,
      )
      onChunk?.(chunk.length)
    }
  }

  async transaction<T>(fn: (tx: BreweriesDB) => Promise<T>): Promise<T> {
    if ('release' in this.executor) {
      return fn(this)
    }
    const client = await (this.executor as Pool).connect()
    try {
      await client.query('BEGIN')
      const result = await fn(new PgBreweriesDB(client))
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {
        /* swallow rollback failure; surface the original */
      })
      throw err
    } finally {
      client.release()
    }
  }
}

export function makePgBreweriesDB(pool: Pool): BreweriesDB {
  return new PgBreweriesDB(pool)
}

/**
 * Row shape returned by `SELECT brand_id, name, name_kanji, brewery_id,
 * source, confidence FROM brands`. Used by lookup helpers. The check
 * constraint + the provenance_source ENUM in 0001_brands.sql guarantee
 * `source` is one of the canonical 7 values; the cast is safe.
 */
export interface BrandRow {
  brand_id: number
  name: string
  name_kanji: string
  brewery_id: number
  source: ProvenanceSource
  confidence: string | null
}

export function rowToBrand(row: BrandRow): Brand {
  const brand: Brand = {
    brandId: row.brand_id,
    name: row.name,
    nameKanji: row.name_kanji,
    breweryId: row.brewery_id,
    source: row.source,
  }
  if (row.confidence !== null) {
    brand.confidence = Number(row.confidence)
  }
  return brand
}

export interface BreweryRow {
  brewery_id: number
  name: string
  name_kanji: string
  area_id: number
  source: ProvenanceSource
  confidence: string | null
}

export function rowToBrewery(row: BreweryRow): Brewery {
  const brewery: Brewery = {
    breweryId: row.brewery_id,
    name: row.name,
    nameKanji: row.name_kanji,
    areaId: row.area_id,
    source: row.source,
  }
  if (row.confidence !== null) {
    brewery.confidence = Number(row.confidence)
  }
  return brewery
}
