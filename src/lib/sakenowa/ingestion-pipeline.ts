/**
 * Sakenowa → Postgres ingestion. Idempotent: a second run on unchanged
 * source data writes zero rows. Failure-aborts: any throw inside the
 * transaction rolls back the entire run (no partial writes).
 *
 * The pipeline is theme-agnostic about its dependencies — it takes a
 * Sakenowa-shaped client and a typed DB contract, both of which can be
 * faked in tests. Production wires `getBrands` / `getBreweries` from
 * `./client` and `makePg{Brands,Breweries}DB(pool)` from `./db`.
 *
 * Brands reference breweries via FK (see 0002_breweries.sql); the script
 * ingests breweries first.
 *
 * Performance: classification happens in-memory (cheap); writes go out
 * as a single bulk `INSERT ... VALUES (...), (...) ON CONFLICT` chunked
 * by the DB layer. Idempotent re-runs do zero writes — the existing
 * content-hash check still gates per row. On Sakenowa-cloud → Supabase-
 * cloud first-time ingest, this collapses ~5000 round trips into ~10.
 */
import { createHash } from 'node:crypto'
import type {
  SakenowaArea,
  SakenowaBrand,
  SakenowaBrewery,
  SakenowaFlavorChart,
  SakenowaFlavorTag,
  SakenowaRankingsPayload,
} from './client'
import { transliterateBatch as defaultTransliterateBatch } from './romaji'
import type {
  AreasDB,
  AreaUpsert,
  BatchProgress,
  BrandsDB,
  BrandUpsert,
  BreweriesDB,
  BreweryUpsert,
  FlavorChartsDB,
  FlavorChartUpsert,
  FlavorTagsDB,
  FlavorTagUpsert,
  IngestionRunInsert,
  IngestionRunsDB,
  RankingsDB,
} from './db'
import type { Area } from '../schemas/area'
import type { Brand } from '../schemas/brand'
import type { Brewery } from '../schemas/brewery'
import type { FlavorChart } from '../schemas/flavor-chart'
import type { FlavorTag } from '../schemas/flavor-tag'
import type { Ranking } from '../schemas/ranking'

export interface RunSummary {
  added: number
  updated: number
  unchanged: number
  total: number
}

export type ProgressCallback = (current: number, total: number) => void

/**
 * Romaji-batch contract: the dep slot accepts any function with the
 * same shape as the production `transliterateBatch` in
 * `./romaji.ts`. The split is mostly for testability — tests inject
 * a deterministic stub, production callers leave it undefined and
 * the default Anthropic-backed implementation runs. Passing
 * explicitly `null` is supported too, for cases where the operator
 * wants to skip transliteration on a particular ingest (offline
 * eval, schema-migration test, etc.).
 */
export type TransliterateBatchFn = typeof import('./romaji.js').transliterateBatch

export interface IngestionDeps {
  client: { getBrands: () => Promise<SakenowaBrand[]> }
  db: BrandsDB
  /**
   * Optional. Called after each *batch write* completes. `current` is
   * the cumulative row count written so far; `total` is the row count
   * the pipeline plans to write (excluding unchanged rows). On an
   * idempotent re-run with nothing changed, this never fires — there's
   * nothing slow happening for the bar to track.
   */
  onProgress?: ProgressCallback
  /**
   * Inject a transliteration function to populate `nameRomaji` on
   * added / updated brands. Defaults to the production Anthropic
   * caller. Set explicitly to `null` to skip transliteration (the
   * column stays NULL on new rows; existing values are preserved by
   * the upsert's COALESCE rule).
   */
  transliterateBatch?: TransliterateBatchFn | null
  /** Optional progress callback for the romaji pass. */
  onRomajiProgress?: ProgressCallback
}

export interface BreweryIngestionDeps {
  client: { getBreweries: () => Promise<SakenowaBrewery[]> }
  db: BreweriesDB
  onProgress?: ProgressCallback
  /** See `IngestionDeps.transliterateBatch`. */
  transliterateBatch?: TransliterateBatchFn | null
  /** See `IngestionDeps.onRomajiProgress`. */
  onRomajiProgress?: ProgressCallback
}

export interface FlavorChartIngestionDeps {
  client: { getFlavorCharts: () => Promise<SakenowaFlavorChart[]> }
  db: FlavorChartsDB
  onProgress?: ProgressCallback
}

export function sakenowaBrandToBrand(s: SakenowaBrand): Brand {
  return {
    brandId: s.id,
    // Sakenowa publishes one Japanese name (typically kanji); we store
    // it in both `name` and `nameKanji`. `nameRomaji` lands NULL here
    // and gets populated by the transliteration pass (`enrichRomaji`)
    // before the row reaches the upsert path.
    name: s.name,
    nameKanji: s.name,
    nameRomaji: null,
    breweryId: s.breweryId,
    source: 'sakenowa',
  }
}

export function computeContentHash(brand: Brand): string {
  // `nameRomaji` is intentionally excluded from the canonical hash —
  // it's a DERIVED display field, not a Sakenowa-published one. A row
  // whose kanji haven't changed should hash identically across
  // ingests so the change-detection loop skips it (zero LLM calls on
  // a re-ingest). When the kanji DO change, the hash differs, the row
  // gets re-classified as updated, and the transliteration pass
  // refreshes the romaji.
  const canonical = JSON.stringify({
    brandId: brand.brandId,
    name: brand.name,
    nameKanji: brand.nameKanji,
    breweryId: brand.breweryId,
    source: brand.source,
    confidence: brand.confidence ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * One DB shape the helper can drive: it must expose its own
 * `transaction(fn)` so the helper stays inside one ACID unit. The
 * existing per-table interfaces (BrandsDB, BreweriesDB, etc.) all
 * satisfy this; the constraint is enforced structurally below.
 */
interface TxDB<Self> {
  transaction<T>(fn: (tx: Self) => Promise<T>): Promise<T>
}

/**
 * Generic config for one Sakenowa → Postgres upsert table.
 *
 * - `TPayload`  : the raw Sakenowa shape (e.g. `SakenowaBrand`).
 * - `TRecord`   : the project-internal schema shape (e.g. `Brand`).
 * - `TDB`       : the per-table DB interface (e.g. `BrandsDB`).
 * - `TUpsertRow`: the per-table upsert tuple (e.g. `BrandUpsert`).
 *
 * The split between `toRecord` and `toUpsertRow` keeps the public
 * `sakenowa*To*` mappers — which other code uses on their own — out
 * of the helper's bookkeeping. The helper computes `contentHash`
 * exactly once and hands it back through `toUpsertRow`.
 */
export interface IngestTableConfig<TPayload, TRecord, TDB extends TxDB<TDB>, TUpsertRow> {
  /** Surfaced inside the wrapping error message; e.g. `"brand"`. */
  label: string
  db: TDB
  fetch: () => Promise<TPayload[]>
  toRecord: (payload: TPayload) => TRecord
  hashOf: (record: TRecord) => string
  /** Primary key used to look up the existing hash in the map. */
  keyOf: (record: TRecord) => number
  toUpsertRow: (record: TRecord, contentHash: string) => TUpsertRow
  /** Per-table read: e.g. `(tx) => tx.getExistingBrandHashes()`. */
  getExistingHashes: (tx: TDB) => Promise<Map<number, string>>
  /** Per-table write: e.g. `(tx, rows, cb) => tx.upsertBrandsBatch(rows, cb)`. */
  upsertBatch: (tx: TDB, rows: TUpsertRow[], onChunk?: BatchProgress) => Promise<void>
  onProgress?: ProgressCallback
  /**
   * Optional post-classification, pre-upsert enrichment hook.
   *
   * Receives the records that survived classification (added +
   * updated), can asynchronously transform them — typically by
   * filling in derived fields like `name_romaji` via an LLM call —
   * and returns the same-length array in the same order.
   *
   * Unchanged rows never reach this hook, so a stable kanji surface
   * means zero work. Skipping the hook (leaving it undefined) makes
   * the pipeline behave exactly as before: this is a pure additive
   * extension.
   */
  enrichBeforeUpsert?: (records: TRecord[]) => Promise<TRecord[]>
}

/**
 * Generic orchestration shared by every per-table Sakenowa upsert
 * (`ingestBrands`, `ingestBreweries`, `ingestFlavorCharts`,
 * `ingestAreas`, `ingestFlavorTags`).
 *
 * Sequence: fetch → open tx → read existing hashes → classify each
 * row as added / updated / unchanged → batched upsert → wrap PG
 * errors with row counts + tagged label. Idempotent: a re-run on
 * unchanged source data writes zero rows and skips `onProgress`.
 *
 * The mapping functions (`toRecord` / `toUpsertRow` / `hashOf` /
 * `keyOf`) and the per-table DB calls stay caller-supplied; the
 * loop and error-shape are what the helper concentrates.
 */
export async function ingestSakenowaTable<
  TPayload,
  TRecord,
  TDB extends TxDB<TDB>,
  TUpsertRow,
>(config: IngestTableConfig<TPayload, TRecord, TDB, TUpsertRow>): Promise<RunSummary> {
  const payloads = await config.fetch()

  return config.db.transaction(async (tx) => {
    const existing = await config.getExistingHashes(tx)
    let added = 0
    let updated = 0
    let unchanged = 0
    // Records that need to be written, held in record-form so the
    // optional `enrichBeforeUpsert` hook can mutate them before they
    // get serialised into the upsert tuple. Order is preserved end-
    // to-end so the enriched record at index N becomes the upsert
    // row at index N.
    const recordsToWrite: { record: TRecord; contentHash: string }[] = []

    const total = payloads.length
    for (let i = 0; i < total; i++) {
      const record = config.toRecord(payloads[i])
      const contentHash = config.hashOf(record)
      const existingHash = existing.get(config.keyOf(record))

      if (existingHash === undefined) {
        recordsToWrite.push({ record, contentHash })
        added++
      } else if (existingHash === contentHash) {
        unchanged++
      } else {
        recordsToWrite.push({ record, contentHash })
        updated++
      }
    }

    const enrichedRecords = config.enrichBeforeUpsert
      ? await config.enrichBeforeUpsert(recordsToWrite.map((r) => r.record))
      : recordsToWrite.map((r) => r.record)

    if (enrichedRecords.length !== recordsToWrite.length) {
      throw new Error(
        `enrichBeforeUpsert returned ${enrichedRecords.length} records for ${recordsToWrite.length} ${config.label} inputs — length mismatch invalidates the per-index pairing with contentHash.`,
      )
    }

    const toUpsert: TUpsertRow[] = enrichedRecords.map((record, i) =>
      config.toUpsertRow(record, recordsToWrite[i].contentHash),
    )

    let written = 0
    try {
      await config.upsertBatch(tx, toUpsert, (rowsThisChunk) => {
        written += rowsThisChunk
        config.onProgress?.(written, toUpsert.length)
      })
    } catch (err) {
      // The batch failed; we don't know exactly which row triggered
      // it, but PG's error.detail typically carries the offending
      // value (e.g. "Key (brewery_id)=(123) is not present in table
      // breweries" for FK violations). `formatPgError` forwards that
      // detail. If the operator needs more, an env-gated per-row
      // fallback could re-run one-at-a-time, but in practice the PG
      // detail is enough.
      throw new Error(
        `Failed to upsert ${toUpsert.length} ${config.label} row(s) (added=${added}, updated=${updated}): ${formatPgError(err)}`,
        { cause: err },
      )
    }

    return { added, updated, unchanged, total }
  })
}

export async function ingestBrands(deps: IngestionDeps): Promise<RunSummary> {
  return ingestSakenowaTable({
    label: 'brand',
    db: deps.db,
    // Closure-wrapped so a method-style client keeps its `this` binding —
    // passing `deps.client.getBrands` bare would detach the receiver.
    fetch: () => deps.client.getBrands(),
    toRecord: sakenowaBrandToBrand,
    hashOf: computeContentHash,
    keyOf: (brand) => brand.brandId,
    toUpsertRow: (brand, contentHash): BrandUpsert => ({ brand, contentHash }),
    getExistingHashes: (tx) => tx.getExistingBrandHashes(),
    upsertBatch: (tx, rows, onChunk) => tx.upsertBrandsBatch(rows, onChunk),
    onProgress: deps.onProgress,
    enrichBeforeUpsert: (brands) => enrichBrandsWithRomaji(brands, deps),
  })
}

/**
 * Calls the romaji transliteration service on each brand that the
 * pipeline classified as added / updated. Returns the brands in the
 * same order, with `nameRomaji` populated where the model call
 * succeeded. Failed calls leave the row with `nameRomaji: null` and
 * log to stderr; the next ingest re-tries.
 *
 * The `deps.transliterateBatch` injection point lets tests stub the
 * model call; production callers leave it undefined and the default
 * Anthropic-backed implementation runs.
 */
async function enrichBrandsWithRomaji(
  brands: Brand[],
  deps: IngestionDeps,
): Promise<Brand[]> {
  if (brands.length === 0 || deps.transliterateBatch === null) return brands
  const fn = deps.transliterateBatch ?? defaultTransliterateBatch
  const results = await fn(
    brands.map((b) => ({ id: b.brandId, nameKanji: b.nameKanji })),
    { onProgress: deps.onRomajiProgress },
  )
  return brands.map((brand, i) => ({
    ...brand,
    nameRomaji: results[i]?.nameRomaji ?? null,
  }))
}

export function sakenowaBreweryToBrewery(s: SakenowaBrewery): Brewery {
  return {
    breweryId: s.id,
    name: s.name,
    nameKanji: s.name,
    // Set by the transliteration pass before upsert; see
    // `sakenowaBrandToBrand` for the same pattern. Placeholder rows
    // (`isPlaceholderBrewery`) keep `nameRomaji: null` permanently —
    // there's no kanji to transliterate.
    nameRomaji: null,
    areaId: s.areaId,
    source: 'sakenowa',
  }
}

export function computeBreweryContentHash(brewery: Brewery): string {
  const canonical = JSON.stringify({
    breweryId: brewery.breweryId,
    name: brewery.name,
    nameKanji: brewery.nameKanji,
    areaId: brewery.areaId,
    source: brewery.source,
    confidence: brewery.confidence ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export async function ingestBreweries(deps: BreweryIngestionDeps): Promise<RunSummary> {
  return ingestSakenowaTable({
    label: 'brewery',
    db: deps.db,
    fetch: () => deps.client.getBreweries(),
    toRecord: sakenowaBreweryToBrewery,
    hashOf: computeBreweryContentHash,
    keyOf: (brewery) => brewery.breweryId,
    toUpsertRow: (brewery, contentHash): BreweryUpsert => ({ brewery, contentHash }),
    getExistingHashes: (tx) => tx.getExistingBreweryHashes(),
    upsertBatch: (tx, rows, onChunk) => tx.upsertBreweriesBatch(rows, onChunk),
    onProgress: deps.onProgress,
    enrichBeforeUpsert: (breweries) => enrichBreweriesWithRomaji(breweries, deps),
  })
}

/**
 * Brewery counterpart to `enrichBrandsWithRomaji`. Skips Sakenowa's
 * placeholder rows (empty `nameKanji`) at the romaji-batch level —
 * the batch helper short-circuits empties to `null` rather than
 * burning a model call.
 */
async function enrichBreweriesWithRomaji(
  breweries: Brewery[],
  deps: BreweryIngestionDeps,
): Promise<Brewery[]> {
  if (breweries.length === 0 || deps.transliterateBatch === null) return breweries
  const fn = deps.transliterateBatch ?? defaultTransliterateBatch
  const results = await fn(
    breweries.map((b) => ({ id: b.breweryId, nameKanji: b.nameKanji })),
    { onProgress: deps.onRomajiProgress },
  )
  return breweries.map((brewery, i) => ({
    ...brewery,
    nameRomaji: results[i]?.nameRomaji ?? null,
  }))
}

export function sakenowaFlavorChartToFlavorChart(s: SakenowaFlavorChart): FlavorChart {
  return {
    brandId: s.brandId,
    f1: s.f1,
    f2: s.f2,
    f3: s.f3,
    f4: s.f4,
    f5: s.f5,
    f6: s.f6,
    source: 'sakenowa',
  }
}

export function computeFlavorChartContentHash(chart: FlavorChart): string {
  // Axis floats are stringified verbatim. Sakenowa publishes ~12 decimal
  // digits; if a future Sakenowa run truncates them, the hash changes
  // and the row gets re-written — fine, same as brand/brewery name
  // canonicalisation.
  const canonical = JSON.stringify({
    brandId: chart.brandId,
    f1: chart.f1,
    f2: chart.f2,
    f3: chart.f3,
    f4: chart.f4,
    f5: chart.f5,
    f6: chart.f6,
    source: chart.source,
    confidence: chart.confidence ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export async function ingestFlavorCharts(
  deps: FlavorChartIngestionDeps,
): Promise<RunSummary> {
  return ingestSakenowaTable({
    label: 'flavor_chart',
    db: deps.db,
    fetch: () => deps.client.getFlavorCharts(),
    toRecord: sakenowaFlavorChartToFlavorChart,
    hashOf: computeFlavorChartContentHash,
    keyOf: (flavorChart) => flavorChart.brandId,
    toUpsertRow: (flavorChart, contentHash): FlavorChartUpsert => ({ flavorChart, contentHash }),
    getExistingHashes: (tx) => tx.getExistingFlavorChartHashes(),
    upsertBatch: (tx, rows, onChunk) => tx.upsertFlavorChartsBatch(rows, onChunk),
    onProgress: deps.onProgress,
  })
}

// ---------- Areas ----------

export interface AreaIngestionDeps {
  client: { getAreas: () => Promise<SakenowaArea[]> }
  db: AreasDB
  onProgress?: ProgressCallback
}

export function sakenowaAreaToArea(s: SakenowaArea): Area {
  return {
    areaId: s.id,
    name: s.name,
    source: 'sakenowa',
  }
}

export function computeAreaContentHash(area: Area): string {
  const canonical = JSON.stringify({
    areaId: area.areaId,
    name: area.name,
    source: area.source,
    confidence: area.confidence ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export async function ingestAreas(deps: AreaIngestionDeps): Promise<RunSummary> {
  return ingestSakenowaTable({
    label: 'area',
    db: deps.db,
    fetch: () => deps.client.getAreas(),
    toRecord: sakenowaAreaToArea,
    hashOf: computeAreaContentHash,
    keyOf: (area) => area.areaId,
    toUpsertRow: (area, contentHash): AreaUpsert => ({ area, contentHash }),
    getExistingHashes: (tx) => tx.getExistingAreaHashes(),
    upsertBatch: (tx, rows, onChunk) => tx.upsertAreasBatch(rows, onChunk),
    onProgress: deps.onProgress,
  })
}

// ---------- FlavorTags ----------

export interface FlavorTagIngestionDeps {
  client: { getFlavorTags: () => Promise<SakenowaFlavorTag[]> }
  db: FlavorTagsDB
  onProgress?: ProgressCallback
}

export function sakenowaFlavorTagToFlavorTag(s: SakenowaFlavorTag): FlavorTag {
  return {
    tagId: s.id,
    name: s.tag,
    source: 'sakenowa',
  }
}

export function computeFlavorTagContentHash(tag: FlavorTag): string {
  const canonical = JSON.stringify({
    tagId: tag.tagId,
    name: tag.name,
    source: tag.source,
    confidence: tag.confidence ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export async function ingestFlavorTags(deps: FlavorTagIngestionDeps): Promise<RunSummary> {
  return ingestSakenowaTable({
    label: 'flavor_tag',
    db: deps.db,
    fetch: () => deps.client.getFlavorTags(),
    toRecord: sakenowaFlavorTagToFlavorTag,
    hashOf: computeFlavorTagContentHash,
    keyOf: (tag) => tag.tagId,
    toUpsertRow: (tag, contentHash): FlavorTagUpsert => ({ tag, contentHash }),
    getExistingHashes: (tx) => tx.getExistingFlavorTagHashes(),
    upsertBatch: (tx, rows, onChunk) => tx.upsertFlavorTagsBatch(rows, onChunk),
    onProgress: deps.onProgress,
  })
}

// ---------- Rankings ----------
//
// ADR-0002: latest snapshot only. We don't classify per-row; we
// wholesale-replace the table inside the transaction.
//
// Sakenowa publishes ~24 orphan area-rankings per snapshot — brand_ids
// that exist in the ranking feed but were deactivated from /brands
// since the last Sakenowa sync. The FK from rankings.brand_id would
// reject them, so the pipeline reads the known brand_id set inside the
// same transaction, filters orphans out, and reports the dropped count.
// Alternatives considered: (a) drop the FK — loses integrity for a
// 1.8% data-quality issue; (b) skip rankings whose brand-set diverges
// — too brittle. Filter-and-report is the conservative choice.

export interface RankingIngestionDeps {
  client: { getRankings: () => Promise<SakenowaRankingsPayload> }
  db: RankingsDB
  onProgress?: ProgressCallback
}

export interface RankingRunSummary {
  /** Rows actually written (post-orphan-filter). */
  total: number
  /** Sakenowa rankings whose brand_id has no matching row in `brands`. */
  dropped: number
  yearMonth: string
}

export function sakenowaRankingsToRankings(payload: SakenowaRankingsPayload): Ranking[] {
  const rows: Ranking[] = []
  for (const entry of payload.overall) {
    rows.push({
      kind: 'overall',
      areaId: null,
      rank: entry.rank,
      brandId: entry.brandId,
      score: entry.score,
      source: 'sakenowa',
    })
  }
  for (const area of payload.areas) {
    for (const entry of area.ranking) {
      rows.push({
        kind: 'area',
        areaId: area.areaId,
        rank: entry.rank,
        brandId: entry.brandId,
        score: entry.score,
        source: 'sakenowa',
      })
    }
  }
  return rows
}

export async function ingestRankings(deps: RankingIngestionDeps): Promise<RankingRunSummary> {
  const payload = await deps.client.getRankings()
  const allRows = sakenowaRankingsToRankings(payload)

  return deps.db.transaction(async (tx) => {
    // Read inside the tx so the brand set can't race a concurrent delete
    // between filter and INSERT (Postgres' default isolation gives us a
    // consistent snapshot for the rest of the transaction).
    const knownBrandIds = await tx.getKnownBrandIds()
    const rows = allRows.filter((r) => knownBrandIds.has(r.brandId))
    const dropped = allRows.length - rows.length

    let written = 0
    try {
      await tx.replaceAll(rows, (rowsThisChunk) => {
        written += rowsThisChunk
        deps.onProgress?.(written, rows.length)
      })
    } catch (err) {
      throw new Error(
        `Failed to replace ${rows.length} ranking row(s): ${formatPgError(err)}`,
        { cause: err },
      )
    }
    return { total: rows.length, dropped, yearMonth: payload.yearMonth }
  })
}

// ---------- Source revision hash ----------
//
// SHA-256 over the canonical JSON of every Sakenowa payload the
// invocation fetched. Issue #54 (cron route) reads this off the latest
// ingestion_runs row to decide "Sakenowa published new data" vs
// "nothing changed, skip ingest".
//
// The outer wrapper below sets keys in a fixed order so the hash is
// stable across invocations regardless of how the caller built the
// `inputs` object. The hash is NOT invariant to Sakenowa-side key
// reordering inside a single payload — JSON.stringify honours the
// object's existing key order, so a `{yearMonth, areas, overall}`
// response would hash differently from `{yearMonth, overall, areas}`.
// In practice Sakenowa's order is stable, so the false-positive risk
// is low; tighten to a deep canonicalisation only if it ever bites.
export interface SourceRevisionInputs {
  brands?: SakenowaBrand[]
  breweries?: SakenowaBrewery[]
  flavorCharts?: SakenowaFlavorChart[]
  areas?: SakenowaArea[]
  flavorTags?: SakenowaFlavorTag[]
  rankings?: SakenowaRankingsPayload
}

export function computeSourceRevisionHash(inputs: SourceRevisionInputs): string {
  // Fixed key order so the hash is stable across invocations regardless
  // of how the caller built the object.
  const canonical = JSON.stringify({
    brands: inputs.brands ?? null,
    breweries: inputs.breweries ?? null,
    flavorCharts: inputs.flavorCharts ?? null,
    areas: inputs.areas ?? null,
    flavorTags: inputs.flavorTags ?? null,
    rankings: inputs.rankings ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

// ---------- IngestionRuns ----------

export async function recordIngestionRun(
  db: IngestionRunsDB,
  run: IngestionRunInsert,
): Promise<void> {
  await db.insertRun(run)
}

// PG errors carry actionable context in fields beyond .message — surface
// the SQLSTATE code, table, constraint, and detail (which often names
// the offending key value). Falls back to message + stringification.
function formatPgError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const pg = err as Error & {
    code?: string
    detail?: string
    table?: string
    constraint?: string
  }
  const parts = [err.message]
  if (pg.code) parts.push(`code=${pg.code}`)
  if (pg.table) parts.push(`table=${pg.table}`)
  if (pg.constraint) parts.push(`constraint=${pg.constraint}`)
  if (pg.detail) parts.push(`detail=${pg.detail}`)
  return parts.join(' | ')
}
