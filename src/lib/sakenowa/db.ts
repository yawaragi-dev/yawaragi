/**
 * Database-shaped contract the ingestion pipeline depends on.
 *
 * The pipeline never imports pg directly. `makePgBrandsDB` wraps a real
 * pg.Pool for production; tests pass an in-memory fake. `transaction()`
 * lets the pipeline scope all writes to a single ACID unit — failure-
 * aborts (no partial writes) follow from a real Postgres ROLLBACK in
 * production and from an explicit no-commit semantic in the fake.
 *
 * The five reference tables (brands, breweries, flavor_charts, areas,
 * flavor_tags) share one chunked `INSERT … ON CONFLICT DO UPDATE`
 * upsert shape. Rather than five byte-identical classes, a single
 * generic `PgUpsertDriver` reads a per-table `UpsertTableSpec` and
 * builds the transaction / chunked-INSERT / existing-hash machinery
 * once. Each `makePg*DB` factory adapts that driver to the per-table
 * interface's method names (`getExistingBrandHashes`, …). Rankings is
 * deliberately NOT part of this driver — it wholesale-replaces via
 * TRUNCATE (ADR-0002), which the upsert shape doesn't fit.
 *
 * NOTE: deliberately no `import 'server-only'` here. `db.ts` is imported by
 * the CLI scripts (`scripts/ingest-sakenowa.ts` via tsx, which has no
 * `react-server` condition and would crash on the server-only stub). The
 * meaningful protection lives at `src/lib/supabase/server-client.ts`, which
 * is the entry that touches env / secrets. db.ts on its own only handles
 * an injected pg client and pure data shaping.
 */
import type { Pool, PoolClient } from 'pg'
import type { Area, AreaSource } from '../schemas/area'
import type { Brand, BrandSource } from '../schemas/brand'
import type { Brewery, BrewerySource } from '../schemas/brewery'
import type { FlavorChart, FlavorChartSource } from '../schemas/flavor-chart'
import type { FlavorTag, FlavorTagSource } from '../schemas/flavor-tag'
import type { IngestionRun, IngestionRunStatus, PerTableCounts } from '../schemas/ingestion-run'
import type { Ranking, RankingKind, RankingSource } from '../schemas/ranking'
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

/**
 * Manual-curation brand identity, used by the ingest conflict-
 * detection pass (ADR-0014). Key shape `<name_kanji>::<brewery_id>`
 * matches the semantic identity Sakenowa would use if it republished
 * the brand.
 */
export interface ManualBrandKey {
  brandId: number
  nameKanji: string
  breweryId: number
}

export interface BrandsDB {
  getExistingBrandHashes(): Promise<Map<number, string>>
  upsertBrandsBatch(rows: readonly BrandUpsert[], onChunk?: BatchProgress): Promise<void>
  /**
   * Returns the live (non-superseded) `manual_curation` brand rows,
   * keyed by `<name_kanji>::<brewery_id>` for O(1) match lookup
   * against an incoming Sakenowa batch.
   */
  getLiveManualBrandKeys(): Promise<Map<string, ManualBrandKey>>
  /** Marks the given brand rows as superseded. No-op on empty input. */
  supersedeBrands(brandIds: ReadonlyArray<number>, when: Date): Promise<void>
  transaction<T>(fn: (tx: BrandsDB) => Promise<T>): Promise<T>
}

// Postgres caps placeholders at 65535/query; 7 placeholders per brand row
// → ~9362 rows max. We pick 500 as a safety margin that also bounds the
// SQL-string size and memory footprint per statement. One batch fits the
// Phase 2 row counts (1733 breweries, 3167 brands) in 4-7 statements.
const BATCH_SIZE = 500

/**
 * Sentinel content-hash returned by `getExistingBrand/BreweryHashes`
 * for rows that need the romaji-enrichment pass to run on the next
 * ingest (typically: rows created before migration 0010, whose
 * `name_romaji` is still NULL). Chosen to be impossible as a real
 * SHA-256 hex value — the surrounding double-underscore marker won't
 * appear in a hex string.
 */
const ROMAJI_BACKFILL_SENTINEL = '__needs_romaji_backfill__'

// ---------- Generic upsert driver ----------

/**
 * Per-table configuration for the chunked upsert. The five hand-rolled
 * Pg*DB classes differed only in these fields; `PgUpsertDriver` reads
 * them and concentrates the shared machinery.
 */
interface UpsertTableSpec<TUpsertRow> {
  /** Target table, e.g. `"brands"`. Also the ON CONFLICT set's qualifier. */
  table: string
  /** Primary-key column, e.g. `"brand_id"`. Also the ON CONFLICT target. */
  keyColumn: string
  /**
   * SQL expression aliased as `content_hash` in `getExistingHashes`.
   * Plain `"content_hash"` for most tables; a CASE expression for
   * brands / breweries where a NULL `name_romaji` yields the romaji-
   * backfill sentinel (see `ROMAJI_BACKFILL_SENTINEL`).
   */
  hashExpression: string
  /** Insert columns in positional order; `updated_at` is appended as NOW(). */
  insertColumns: readonly string[]
  /**
   * Columns whose ON CONFLICT update uses
   * `COALESCE(EXCLUDED.col, table.col)` instead of `EXCLUDED.col` — i.e.
   * don't clobber an existing value with an incoming NULL. Today only
   * `name_romaji` on brands + breweries.
   */
  coalesceColumns?: readonly string[]
  /** Positional values for one row, matching `insertColumns` order. */
  valuesOf: (row: TUpsertRow) => readonly unknown[]
}

/**
 * The single BEGIN/COMMIT/ROLLBACK helper. Nested transactions: if the
 * executor is already a PoolClient inside a BEGIN (detected via the
 * presence of `release`), reuse it as one logical unit and call `fn`
 * with the current adapter. Otherwise connect, BEGIN, run, COMMIT — and
 * on any throw ROLLBACK (swallowing a rollback failure so the original
 * error surfaces), always releasing the client.
 */
async function withTransaction<TDB, T>(
  executor: Pool | PoolClient,
  self: TDB,
  makeChild: (client: PoolClient) => TDB,
  fn: (tx: TDB) => Promise<T>,
): Promise<T> {
  if ('release' in executor) {
    return fn(self)
  }
  const client = await (executor as Pool).connect()
  try {
    await client.query('BEGIN')
    const result = await fn(makeChild(client))
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

/**
 * Config-driven upsert for one Sakenowa reference table. Replaces the
 * five near-identical `Pg*DB` classes: the chunked `INSERT … ON CONFLICT
 * DO UPDATE` placeholder loop and the `SELECT key, content_hash` read
 * live here once, parameterised by an `UpsertTableSpec`.
 */
class PgUpsertDriver<TUpsertRow> {
  constructor(
    private readonly executor: Pool | PoolClient,
    private readonly spec: UpsertTableSpec<TUpsertRow>,
  ) {}

  async getExistingHashes(): Promise<Map<number, string>> {
    // Rows whose `name_romaji` hasn't been populated yet need the
    // enrichment pass to run even if their kanji haven't changed — the
    // per-table `hashExpression` returns a sentinel "hash" that can't
    // collide with any real SHA-256 hex value, so the pipeline
    // classifies them as "updated" and routes them through
    // enrichBeforeUpsert. Tables without a romaji column select
    // `content_hash` verbatim.
    const { keyColumn, hashExpression, table } = this.spec
    const { rows } = await this.executor.query<Record<string, string | number>>(
      `SELECT ${keyColumn},
              ${hashExpression} AS content_hash
       FROM ${table}`,
    )
    return new Map(rows.map((r) => [r[keyColumn] as number, r.content_hash as string]))
  }

  async upsertBatch(rows: readonly TUpsertRow[], onChunk?: BatchProgress): Promise<void> {
    if (rows.length === 0) return
    const { table, keyColumn, insertColumns, coalesceColumns = [], valuesOf } = this.spec
    const columnList = insertColumns.join(', ')
    // Every non-key column is refreshed from EXCLUDED, except the
    // COALESCE columns which preserve the existing value when the
    // incoming row supplies NULL. `updated_at` is always stamped NOW().
    const updateSet = insertColumns
      .filter((c) => c !== keyColumn)
      .map((c) =>
        coalesceColumns.includes(c)
          ? `${c} = COALESCE(EXCLUDED.${c}, ${table}.${c})`
          : `${c} = EXCLUDED.${c}`,
      )
      .concat('updated_at = NOW()')
      .join(',\n           ')

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const chunk = rows.slice(start, start + BATCH_SIZE)
      const placeholders: string[] = []
      const values: unknown[] = []
      for (const row of chunk) {
        const i = values.length
        // N positional placeholders + literal NOW() for updated_at.
        const slots = insertColumns.map((_, j) => `$${i + j + 1}`)
        placeholders.push(`(${slots.join(', ')}, NOW())`)
        values.push(...valuesOf(row))
      }
      await this.executor.query(
        `INSERT INTO ${table}
           (${columnList}, updated_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (${keyColumn}) DO UPDATE SET
           ${updateSet}`,
        values,
      )
      onChunk?.(chunk.length)
    }
  }
}

// ---------- Brands ----------

const brandsUpsertSpec: UpsertTableSpec<BrandUpsert> = {
  table: 'brands',
  keyColumn: 'brand_id',
  // Rows created before migration 0010 have `name_romaji IS NULL`; the
  // sentinel reclassifies them as "updated" so their first post-
  // migration ingest fills the romaji and recomputes the hash. A second
  // ingest with no Sakenowa changes is then a true no-op.
  hashExpression: `CASE WHEN name_romaji IS NULL THEN '${ROMAJI_BACKFILL_SENTINEL}'
                   ELSE content_hash
              END`,
  insertColumns: [
    'brand_id',
    'name',
    'name_kanji',
    'name_romaji',
    'brewery_id',
    'source',
    'confidence',
    'content_hash',
  ],
  // Preserve the existing romaji when the incoming row didn't supply one
  // (e.g. an ingest that skipped the transliteration step).
  coalesceColumns: ['name_romaji'],
  valuesOf: ({ brand, contentHash }) => [
    brand.brandId,
    brand.name,
    brand.nameKanji,
    brand.nameRomaji,
    brand.breweryId,
    brand.source,
    brand.confidence ?? null,
    contentHash,
  ],
}

export function makePgBrandsDB(executor: Pool | PoolClient): BrandsDB {
  const driver = new PgUpsertDriver<BrandUpsert>(executor, brandsUpsertSpec)
  const self: BrandsDB = {
    getExistingBrandHashes: () => driver.getExistingHashes(),
    upsertBrandsBatch: (rows, onChunk) => driver.upsertBatch(rows, onChunk),
    async getLiveManualBrandKeys(): Promise<Map<string, ManualBrandKey>> {
      const { rows } = await executor.query<{
        brand_id: number
        name_kanji: string
        brewery_id: number
      }>(
        `SELECT brand_id, name_kanji, brewery_id
         FROM brands
         WHERE source = 'manual_curation' AND superseded_at IS NULL`,
      )
      return new Map(
        rows.map((r) => [
          `${r.name_kanji}::${r.brewery_id}`,
          { brandId: r.brand_id, nameKanji: r.name_kanji, breweryId: r.brewery_id },
        ]),
      )
    },
    async supersedeBrands(brandIds: ReadonlyArray<number>, when: Date): Promise<void> {
      if (brandIds.length === 0) return
      await executor.query(
        `UPDATE brands
         SET superseded_at = $1
         WHERE brand_id = ANY($2::int[])
           AND source = 'manual_curation'
           AND superseded_at IS NULL`,
        [when, [...brandIds]],
      )
    },
    transaction<T>(fn: (tx: BrandsDB) => Promise<T>): Promise<T> {
      return withTransaction(executor, self, makePgBrandsDB, fn)
    },
  }
  return self
}

// ---------- Breweries ----------

export interface BreweryUpsert {
  brewery: Brewery
  contentHash: string
}

export interface BreweriesDB {
  getExistingBreweryHashes(): Promise<Map<number, string>>
  upsertBreweriesBatch(rows: readonly BreweryUpsert[], onChunk?: BatchProgress): Promise<void>
  transaction<T>(fn: (tx: BreweriesDB) => Promise<T>): Promise<T>
}

const breweriesUpsertSpec: UpsertTableSpec<BreweryUpsert> = {
  table: 'breweries',
  keyColumn: 'brewery_id',
  // Same sentinel trick as brands, plus `length(name_kanji) > 0`: the
  // ~48 Sakenowa placeholder breweries have empty `name_kanji`, so their
  // `name_romaji` is genuinely permanent-NULL — don't mark them for
  // backfill, the transliteration call would just no-op.
  hashExpression: `CASE WHEN name_romaji IS NULL AND length(name_kanji) > 0
                   THEN '${ROMAJI_BACKFILL_SENTINEL}'
                   ELSE content_hash
              END`,
  insertColumns: [
    'brewery_id',
    'name',
    'name_kanji',
    'name_romaji',
    'area_id',
    'source',
    'confidence',
    'content_hash',
  ],
  coalesceColumns: ['name_romaji'],
  valuesOf: ({ brewery, contentHash }) => [
    brewery.breweryId,
    brewery.name,
    brewery.nameKanji,
    brewery.nameRomaji,
    brewery.areaId,
    brewery.source,
    brewery.confidence ?? null,
    contentHash,
  ],
}

export function makePgBreweriesDB(executor: Pool | PoolClient): BreweriesDB {
  const driver = new PgUpsertDriver<BreweryUpsert>(executor, breweriesUpsertSpec)
  const self: BreweriesDB = {
    getExistingBreweryHashes: () => driver.getExistingHashes(),
    upsertBreweriesBatch: (rows, onChunk) => driver.upsertBatch(rows, onChunk),
    transaction<T>(fn: (tx: BreweriesDB) => Promise<T>): Promise<T> {
      return withTransaction(executor, self, makePgBreweriesDB, fn)
    },
  }
  return self
}

// ---------- FlavorCharts ----------

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

const flavorChartsUpsertSpec: UpsertTableSpec<FlavorChartUpsert> = {
  table: 'flavor_charts',
  keyColumn: 'brand_id',
  hashExpression: 'content_hash',
  insertColumns: [
    'brand_id',
    'f1',
    'f2',
    'f3',
    'f4',
    'f5',
    'f6',
    'source',
    'confidence',
    'content_hash',
  ],
  valuesOf: ({ flavorChart, contentHash }) => [
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
  ],
}

export function makePgFlavorChartsDB(executor: Pool | PoolClient): FlavorChartsDB {
  const driver = new PgUpsertDriver<FlavorChartUpsert>(executor, flavorChartsUpsertSpec)
  const self: FlavorChartsDB = {
    getExistingFlavorChartHashes: () => driver.getExistingHashes(),
    upsertFlavorChartsBatch: (rows, onChunk) => driver.upsertBatch(rows, onChunk),
    transaction<T>(fn: (tx: FlavorChartsDB) => Promise<T>): Promise<T> {
      return withTransaction(executor, self, makePgFlavorChartsDB, fn)
    },
  }
  return self
}

/**
 * Row shape returned by `SELECT brand_id, name, name_kanji, brewery_id,
 * source, confidence FROM brands`. Used by lookup helpers. The check
 * constraint + the provenance_source ENUM in 0001_brands.sql guarantee
 * `source` is one of the canonical 7 values; we additionally narrow to
 * the per-record subset here so the type matches the parse-time
 * invariant in `BrandSchema` (ADR-0005). A row whose stored `source`
 * falls outside `BrandSource` is a data-corruption bug, not a normal
 * case the type system should accommodate.
 */
export interface BrandRow {
  brand_id: number
  name: string
  name_kanji: string
  name_romaji: string | null
  brewery_id: number
  source: BrandSource
  confidence: string | null
}

export function rowToBrand(row: BrandRow): Brand {
  const brand: Brand = {
    brandId: row.brand_id,
    name: row.name,
    nameKanji: row.name_kanji,
    nameRomaji: row.name_romaji,
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
  name_romaji: string | null
  area_id: number
  source: BrewerySource
  confidence: string | null
}

export function rowToBrewery(row: BreweryRow): Brewery {
  const brewery: Brewery = {
    breweryId: row.brewery_id,
    name: row.name,
    nameKanji: row.name_kanji,
    nameRomaji: row.name_romaji,
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
  source: FlavorChartSource
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

const areasUpsertSpec: UpsertTableSpec<AreaUpsert> = {
  table: 'areas',
  keyColumn: 'area_id',
  hashExpression: 'content_hash',
  insertColumns: ['area_id', 'name', 'source', 'confidence', 'content_hash'],
  valuesOf: ({ area, contentHash }) => [
    area.areaId,
    area.name,
    area.source,
    area.confidence ?? null,
    contentHash,
  ],
}

export function makePgAreasDB(executor: Pool | PoolClient): AreasDB {
  const driver = new PgUpsertDriver<AreaUpsert>(executor, areasUpsertSpec)
  const self: AreasDB = {
    getExistingAreaHashes: () => driver.getExistingHashes(),
    upsertAreasBatch: (rows, onChunk) => driver.upsertBatch(rows, onChunk),
    transaction<T>(fn: (tx: AreasDB) => Promise<T>): Promise<T> {
      return withTransaction(executor, self, makePgAreasDB, fn)
    },
  }
  return self
}

export interface AreaRow {
  area_id: number
  name: string
  source: AreaSource
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

const flavorTagsUpsertSpec: UpsertTableSpec<FlavorTagUpsert> = {
  table: 'flavor_tags',
  keyColumn: 'tag_id',
  hashExpression: 'content_hash',
  insertColumns: ['tag_id', 'name', 'source', 'confidence', 'content_hash'],
  valuesOf: ({ tag, contentHash }) => [
    tag.tagId,
    tag.name,
    tag.source,
    tag.confidence ?? null,
    contentHash,
  ],
}

export function makePgFlavorTagsDB(executor: Pool | PoolClient): FlavorTagsDB {
  const driver = new PgUpsertDriver<FlavorTagUpsert>(executor, flavorTagsUpsertSpec)
  const self: FlavorTagsDB = {
    getExistingFlavorTagHashes: () => driver.getExistingHashes(),
    upsertFlavorTagsBatch: (rows, onChunk) => driver.upsertBatch(rows, onChunk),
    transaction<T>(fn: (tx: FlavorTagsDB) => Promise<T>): Promise<T> {
      return withTransaction(executor, self, makePgFlavorTagsDB, fn)
    },
  }
  return self
}

export interface FlavorTagRow {
  tag_id: number
  name: string
  source: FlavorTagSource
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
// content_hash column on rankings and no idempotency-by-row. This is why
// rankings does NOT use `PgUpsertDriver`: it TRUNCATEs and re-INSERTs.

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
  source: RankingSource
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
