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
import type { Area } from '../schemas/area'
import type { Brand } from '../schemas/brand'
import type { Brewery } from '../schemas/brewery'
import type { FlavorChart } from '../schemas/flavor-chart'
import type { FlavorTag } from '../schemas/flavor-tag'
import type { IngestionRun, IngestionRunStatus, PerTableCounts } from '../schemas/ingestion-run'
import type { Ranking, RankingKind } from '../schemas/ranking'
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

export interface FlavorChartUpsert {
  flavorChart: FlavorChart
  contentHash: string
}

export interface FlavorChartsDB {
  getExistingFlavorChartHashes(): Promise<Map<number, string>>
  upsertFlavorChartsBatch(
    rows: readonly FlavorChartUpsert[],
    onChunk?: BatchProgress,
  ): Promise<void>
  transaction<T>(fn: (tx: FlavorChartsDB) => Promise<T>): Promise<T>
}

class PgFlavorChartsDB implements FlavorChartsDB {
  constructor(private readonly executor: Pool | PoolClient) {}

  async getExistingFlavorChartHashes(): Promise<Map<number, string>> {
    const { rows } = await this.executor.query<{
      brand_id: number
      content_hash: string
    }>('SELECT brand_id, content_hash FROM flavor_charts')
    return new Map(rows.map((r) => [r.brand_id, r.content_hash]))
  }

  async upsertFlavorChartsBatch(
    rows: readonly FlavorChartUpsert[],
    onChunk?: BatchProgress,
  ): Promise<void> {
    if (rows.length === 0) return
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const chunk = rows.slice(start, start + BATCH_SIZE)
      const placeholders: string[] = []
      const values: unknown[] = []
      for (const { flavorChart, contentHash } of chunk) {
        const i = values.length
        // 10 placeholders + literal NOW() for updated_at
        placeholders.push(
          `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8}, $${i + 9}, $${i + 10}, NOW())`,
        )
        values.push(
          flavorChart.brandId,
          flavorChart.f1,
          flavorChart.f2,
          flavorChart.f3,
          flavorChart.f4,
          flavorChart.f5,
          flavorChart.f6,
          flavorChart.source,
          flavorChart.confidence ?? null,
          contentHash,
        )
      }
      await this.executor.query(
        `INSERT INTO flavor_charts
           (brand_id, f1, f2, f3, f4, f5, f6, source, confidence, content_hash, updated_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (brand_id) DO UPDATE SET
           f1           = EXCLUDED.f1,
           f2           = EXCLUDED.f2,
           f3           = EXCLUDED.f3,
           f4           = EXCLUDED.f4,
           f5           = EXCLUDED.f5,
           f6           = EXCLUDED.f6,
           source       = EXCLUDED.source,
           confidence   = EXCLUDED.confidence,
           content_hash = EXCLUDED.content_hash,
           updated_at   = NOW()`,
        values,
      )
      onChunk?.(chunk.length)
    }
  }

  async transaction<T>(fn: (tx: FlavorChartsDB) => Promise<T>): Promise<T> {
    if ('release' in this.executor) {
      return fn(this)
    }
    const client = await (this.executor as Pool).connect()
    try {
      await client.query('BEGIN')
      const result = await fn(new PgFlavorChartsDB(client))
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

export function makePgFlavorChartsDB(pool: Pool): FlavorChartsDB {
  return new PgFlavorChartsDB(pool)
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

// NUMERIC(5, 4) columns come back as strings — Number() casts them to the
// float shape the schema expects. Same pattern as confidence on brand/brewery.
export interface FlavorChartRow {
  brand_id: number
  f1: string
  f2: string
  f3: string
  f4: string
  f5: string
  f6: string
  source: ProvenanceSource
  confidence: string | null
}

// ---------- Areas ----------

export interface AreaUpsert {
  area: Area
  contentHash: string
}

export interface AreasDB {
  getExistingAreaHashes(): Promise<Map<number, string>>
  upsertAreasBatch(rows: readonly AreaUpsert[], onChunk?: BatchProgress): Promise<void>
  transaction<T>(fn: (tx: AreasDB) => Promise<T>): Promise<T>
}

class PgAreasDB implements AreasDB {
  constructor(private readonly executor: Pool | PoolClient) {}

  async getExistingAreaHashes(): Promise<Map<number, string>> {
    const { rows } = await this.executor.query<{
      area_id: number
      content_hash: string
    }>('SELECT area_id, content_hash FROM areas')
    return new Map(rows.map((r) => [r.area_id, r.content_hash]))
  }

  async upsertAreasBatch(rows: readonly AreaUpsert[], onChunk?: BatchProgress): Promise<void> {
    if (rows.length === 0) return
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const chunk = rows.slice(start, start + BATCH_SIZE)
      const placeholders: string[] = []
      const values: unknown[] = []
      for (const { area, contentHash } of chunk) {
        const i = values.length
        placeholders.push(
          `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, NOW())`,
        )
        values.push(area.areaId, area.name, area.source, area.confidence ?? null, contentHash)
      }
      await this.executor.query(
        `INSERT INTO areas
           (area_id, name, source, confidence, content_hash, updated_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (area_id) DO UPDATE SET
           name         = EXCLUDED.name,
           source       = EXCLUDED.source,
           confidence   = EXCLUDED.confidence,
           content_hash = EXCLUDED.content_hash,
           updated_at   = NOW()`,
        values,
      )
      onChunk?.(chunk.length)
    }
  }

  async transaction<T>(fn: (tx: AreasDB) => Promise<T>): Promise<T> {
    if ('release' in this.executor) {
      return fn(this)
    }
    const client = await (this.executor as Pool).connect()
    try {
      await client.query('BEGIN')
      const result = await fn(new PgAreasDB(client))
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

export function makePgAreasDB(pool: Pool): AreasDB {
  return new PgAreasDB(pool)
}

export interface AreaRow {
  area_id: number
  name: string
  source: ProvenanceSource
  confidence: string | null
}

export function rowToFlavorChart(row: FlavorChartRow): FlavorChart {
  const chart: FlavorChart = {
    brandId: row.brand_id,
    f1: Number(row.f1),
    f2: Number(row.f2),
    f3: Number(row.f3),
    f4: Number(row.f4),
    f5: Number(row.f5),
    f6: Number(row.f6),
    source: row.source,
  }
  if (row.confidence !== null) {
    chart.confidence = Number(row.confidence)
  }
  return chart
}

export function rowToArea(row: AreaRow): Area {
  const area: Area = {
    areaId: row.area_id,
    name: row.name,
    source: row.source,
  }
  if (row.confidence !== null) {
    area.confidence = Number(row.confidence)
  }
  return area
}

// ---------- FlavorTags ----------

export interface FlavorTagUpsert {
  tag: FlavorTag
  contentHash: string
}

export interface FlavorTagsDB {
  getExistingFlavorTagHashes(): Promise<Map<number, string>>
  upsertFlavorTagsBatch(
    rows: readonly FlavorTagUpsert[],
    onChunk?: BatchProgress,
  ): Promise<void>
  transaction<T>(fn: (tx: FlavorTagsDB) => Promise<T>): Promise<T>
}

class PgFlavorTagsDB implements FlavorTagsDB {
  constructor(private readonly executor: Pool | PoolClient) {}

  async getExistingFlavorTagHashes(): Promise<Map<number, string>> {
    const { rows } = await this.executor.query<{
      tag_id: number
      content_hash: string
    }>('SELECT tag_id, content_hash FROM flavor_tags')
    return new Map(rows.map((r) => [r.tag_id, r.content_hash]))
  }

  async upsertFlavorTagsBatch(
    rows: readonly FlavorTagUpsert[],
    onChunk?: BatchProgress,
  ): Promise<void> {
    if (rows.length === 0) return
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const chunk = rows.slice(start, start + BATCH_SIZE)
      const placeholders: string[] = []
      const values: unknown[] = []
      for (const { tag, contentHash } of chunk) {
        const i = values.length
        placeholders.push(
          `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, NOW())`,
        )
        values.push(tag.tagId, tag.name, tag.source, tag.confidence ?? null, contentHash)
      }
      await this.executor.query(
        `INSERT INTO flavor_tags
           (tag_id, name, source, confidence, content_hash, updated_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (tag_id) DO UPDATE SET
           name         = EXCLUDED.name,
           source       = EXCLUDED.source,
           confidence   = EXCLUDED.confidence,
           content_hash = EXCLUDED.content_hash,
           updated_at   = NOW()`,
        values,
      )
      onChunk?.(chunk.length)
    }
  }

  async transaction<T>(fn: (tx: FlavorTagsDB) => Promise<T>): Promise<T> {
    if ('release' in this.executor) {
      return fn(this)
    }
    const client = await (this.executor as Pool).connect()
    try {
      await client.query('BEGIN')
      const result = await fn(new PgFlavorTagsDB(client))
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

export function makePgFlavorTagsDB(pool: Pool): FlavorTagsDB {
  return new PgFlavorTagsDB(pool)
}

export interface FlavorTagRow {
  tag_id: number
  name: string
  source: ProvenanceSource
  confidence: string | null
}

export function rowToFlavorTag(row: FlavorTagRow): FlavorTag {
  const tag: FlavorTag = {
    tagId: row.tag_id,
    name: row.name,
    source: row.source,
  }
  if (row.confidence !== null) {
    tag.confidence = Number(row.confidence)
  }
  return tag
}

// ---------- Rankings ----------
//
// ADR-0002: only the latest snapshot is retained. The DB contract is
// "wholesale replace" rather than "upsert per row" — there is no
// content_hash column on rankings and no idempotency-by-row.

export interface RankingsDB {
  /**
   * Returns every brand_id currently in the brands table. The rankings
   * pipeline uses this to drop orphan ranking rows before INSERT — see
   * `ingestRankings`. Read inside the caller's transaction so it can
   * never race a concurrent brand delete.
   */
  getKnownBrandIds(): Promise<Set<number>>
  replaceAll(rows: readonly Ranking[], onChunk?: BatchProgress): Promise<void>
  transaction<T>(fn: (tx: RankingsDB) => Promise<T>): Promise<T>
}

class PgRankingsDB implements RankingsDB {
  constructor(private readonly executor: Pool | PoolClient) {}

  async getKnownBrandIds(): Promise<Set<number>> {
    const { rows } = await this.executor.query<{ brand_id: number }>(
      'SELECT brand_id FROM brands',
    )
    return new Set(rows.map((r) => r.brand_id))
  }

  async replaceAll(rows: readonly Ranking[], onChunk?: BatchProgress): Promise<void> {
    // TRUNCATE + INSERT inside the caller-provided transaction. On
    // any failure the ROLLBACK leaves the existing rankings intact —
    // an empty rankings table is never a valid intermediate state.
    await this.executor.query('TRUNCATE TABLE rankings')
    if (rows.length === 0) return
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const chunk = rows.slice(start, start + BATCH_SIZE)
      const placeholders: string[] = []
      const values: unknown[] = []
      for (const r of chunk) {
        const i = values.length
        placeholders.push(
          `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7})`,
        )
        values.push(r.kind, r.areaId, r.rank, r.brandId, r.score, r.source, r.confidence ?? null)
      }
      await this.executor.query(
        `INSERT INTO rankings (kind, area_id, rank, brand_id, score, source, confidence)
         VALUES ${placeholders.join(', ')}`,
        values,
      )
      onChunk?.(chunk.length)
    }
  }

  async transaction<T>(fn: (tx: RankingsDB) => Promise<T>): Promise<T> {
    if ('release' in this.executor) {
      return fn(this)
    }
    const client = await (this.executor as Pool).connect()
    try {
      await client.query('BEGIN')
      const result = await fn(new PgRankingsDB(client))
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

export function makePgRankingsDB(pool: Pool): RankingsDB {
  return new PgRankingsDB(pool)
}

export interface RankingRow {
  kind: RankingKind
  area_id: number | null
  rank: number
  brand_id: number
  score: string
  source: ProvenanceSource
  confidence: string | null
}

export function rowToRanking(row: RankingRow): Ranking {
  const ranking: Ranking = {
    kind: row.kind,
    areaId: row.area_id,
    rank: row.rank,
    brandId: row.brand_id,
    score: Number(row.score),
    source: row.source,
  }
  if (row.confidence !== null) {
    ranking.confidence = Number(row.confidence)
  }
  return ranking
}

// ---------- IngestionRuns ----------
//
// Single-row writes — telemetry, not bulk reference data. The interface
// is intentionally `insertRun` (not upsert) because every invocation
// generates a fresh run_id.

export interface IngestionRunsDB {
  insertRun(run: IngestionRunInsert): Promise<void>
}

export interface IngestionRunInsert {
  runId?: string
  startedAt: Date
  finishedAt: Date
  status: IngestionRunStatus
  perTable: IngestionRun['perTable']
  sourceRevisionHash: string
  errorMessage: string | null
}

// Telemetry rows are always hand-stamped by the ingestion script, so the
// provenance is `manual_curation` by definition — encoded here rather than
// taken from the caller so it's impossible to lie about. Mirrors the SQL
// DEFAULT in 0008 and the WithProvenance requirement on IngestionRunSchema.
const INGESTION_RUN_SOURCE = 'manual_curation' satisfies ProvenanceSource

class PgIngestionRunsDB implements IngestionRunsDB {
  constructor(private readonly executor: Pool | PoolClient) {}

  async insertRun(run: IngestionRunInsert): Promise<void> {
    if (run.runId) {
      await this.executor.query(
        `INSERT INTO ingestion_runs
           (run_id, started_at, finished_at, status, per_table, source_revision_hash, error_message, source)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
        [
          run.runId,
          run.startedAt.toISOString(),
          run.finishedAt.toISOString(),
          run.status,
          JSON.stringify(run.perTable),
          run.sourceRevisionHash,
          run.errorMessage,
          INGESTION_RUN_SOURCE,
        ],
      )
      return
    }
    await this.executor.query(
      `INSERT INTO ingestion_runs
         (started_at, finished_at, status, per_table, source_revision_hash, error_message, source)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [
        run.startedAt.toISOString(),
        run.finishedAt.toISOString(),
        run.status,
        JSON.stringify(run.perTable),
        run.sourceRevisionHash,
        run.errorMessage,
        INGESTION_RUN_SOURCE,
      ],
    )
  }
}

export function makePgIngestionRunsDB(pool: Pool): IngestionRunsDB {
  return new PgIngestionRunsDB(pool)
}

// Re-export for ingestion-pipeline / scripts.
export type { PerTableCounts }
