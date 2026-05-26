/**
 * Database-shaped contract the ingestion pipeline depends on.
 *
 * The pipeline never imports pg directly. `PgBrandsDB` wraps a real pg.Pool
 * for production; tests pass an in-memory fake. `transaction()` lets the
 * pipeline scope all writes to a single ACID unit — failure-aborts (no
 * partial writes) follow from a real Postgres ROLLBACK in production and
 * from an explicit no-commit semantic in the fake.
 */
import 'server-only'
import type { Pool, PoolClient } from 'pg'
import type { Brand } from '../schemas/brand'
import type { ProvenanceSource } from '../schemas/with-provenance'

export interface BrandsDB {
  getExistingBrandHashes(): Promise<Map<number, string>>
  upsertBrand(brand: Brand, contentHash: string): Promise<void>
  transaction<T>(fn: (tx: BrandsDB) => Promise<T>): Promise<T>
}

class PgBrandsDB implements BrandsDB {
  constructor(private readonly executor: Pool | PoolClient) {}

  async getExistingBrandHashes(): Promise<Map<number, string>> {
    const { rows } = await this.executor.query<{
      brand_id: number
      content_hash: string
    }>('SELECT brand_id, content_hash FROM brands')
    return new Map(rows.map((r) => [r.brand_id, r.content_hash]))
  }

  async upsertBrand(brand: Brand, contentHash: string): Promise<void> {
    await this.executor.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, brewery_id, source, confidence, content_hash, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (brand_id) DO UPDATE SET
         name         = EXCLUDED.name,
         name_kanji   = EXCLUDED.name_kanji,
         brewery_id   = EXCLUDED.brewery_id,
         source       = EXCLUDED.source,
         confidence   = EXCLUDED.confidence,
         content_hash = EXCLUDED.content_hash,
         updated_at   = NOW()`,
      [
        brand.brandId,
        brand.name,
        brand.nameKanji,
        brand.breweryId,
        brand.source,
        brand.confidence ?? null,
        contentHash,
      ],
    )
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
