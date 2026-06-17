/**
 * Shared driver that sequences the full Sakenowa ingestion pipeline and
 * always writes one `ingestion_runs` telemetry row, regardless of whether
 * the pipeline succeeded, partially-failed mid-table, or threw before the
 * first table.
 *
 * Two callers:
 *   - `scripts/ingest-sakenowa.ts` (the CLI, `pnpm ingest`) — wires real
 *     pg.Pool + Sakenowa client + a TTY progress bar.
 *   - `src/app/api/cron/ingest/route.ts` (#54 cron route) — wires the same
 *     deps minus the progress bar, returns the run summary as JSON.
 *
 * The shape of the returned `IngestionRun` matches the schema in
 * `src/lib/schemas/ingestion-run.ts` so the route can `parseIngestionRun`
 * the response body — and so the CLI exit-code branch can read `.status`
 * without re-deriving it.
 *
 * Run order matches the FK graph: breweries → brands → flavor_charts →
 * areas → flavor_tags → rankings → ingestion_runs. See
 * `scripts/ingest-sakenowa.ts` (slice 5 / 9) for the original prose.
 */
import { randomUUID } from 'node:crypto'
import type {
  SakenowaArea,
  SakenowaBrand,
  SakenowaBrewery,
  SakenowaFlavorChart,
  SakenowaFlavorTag,
  SakenowaRankingsPayload,
} from './client'
import type {
  AreasDB,
  BrandsDB,
  BreweriesDB,
  FlavorChartsDB,
  FlavorTagsDB,
  IngestionRunsDB,
  PerTableCounts,
  RankingsDB,
} from './db'
import type { IngestionRun } from '../schemas/ingestion-run'
import {
  computeSourceRevisionHash,
  ingestAreas,
  ingestBrands,
  ingestBreweries,
  ingestFlavorCharts,
  ingestFlavorTags,
  ingestRankings,
  recordIngestionRun,
  type RankingRunSummary,
  type RunSummary,
} from './ingestion-pipeline'

export interface SakenowaSource {
  getBreweries(): Promise<SakenowaBrewery[]>
  getBrands(): Promise<SakenowaBrand[]>
  getFlavorCharts(): Promise<SakenowaFlavorChart[]>
  getAreas(): Promise<SakenowaArea[]>
  getFlavorTags(): Promise<SakenowaFlavorTag[]>
  getRankings(): Promise<SakenowaRankingsPayload>
}

export interface IngestDriverDBs {
  breweries: BreweriesDB
  brands: BrandsDB
  flavorCharts: FlavorChartsDB
  areas: AreasDB
  flavorTags: FlavorTagsDB
  rankings: RankingsDB
  /**
   * Telemetry-only. Production wires this to a *separate* pg.Pool so the
   * `ingestion_runs` row still lands even if the data pool is errored /
   * rolled-back. The driver itself doesn't manage the pool — the caller
   * owns lifecycle (pool.end()).
   */
  ingestionRuns: IngestionRunsDB
}

export interface DriveIngestOptions {
  /** Stable id for both the response body and the telemetry row. Defaults
   * to `crypto.randomUUID()` — exposed for tests so they can assert. */
  runId?: string
  /** Per-table progress callback. The CLI passes a TTY bar renderer; the
   * route passes nothing. The label distinguishes which table is currently
   * writing — `breweries`, `brands`, etc. */
  onPerTableProgress?: (table: TableLabel, current: number, total: number) => void
  /**
   * `Date` factory, defaults to `() => new Date()`. Lets tests freeze
   * startedAt / finishedAt to a deterministic value.
   */
  now?: () => Date
  /**
   * Manual-curation refresh-conflict policy α confirmation (ADR-0014).
   * When `false` (default) and the incoming Sakenowa batch contains a
   * row whose `(name_kanji, brewery_id)` matches a live
   * `source = 'manual_curation'` row, the ingest aborts with a
   * structured error listing every conflict — the operator reviews
   * and reruns with `supersedeConfirmed: true` (or the CLI
   * `--supersede-confirmed` flag). When `true`, the matching manual
   * rows get `superseded_at = now()` and the Sakenowa upsert
   * proceeds.
   */
  supersedeConfirmed?: boolean
}

export type TableLabel =
  | 'breweries'
  | 'brands'
  | 'flavorCharts'
  | 'areas'
  | 'flavorTags'
  | 'rankings'

/**
 * Result shape returned to the caller. Round-trips through
 * `parseIngestionRun` — the route hands this straight to `Response.json`.
 *
 * `errorMessage` is null on success, non-null on failure. `status` is
 * the canonical signal — callers branch on it for exit codes / HTTP
 * status codes.
 */
export type IngestDriverResult = IngestionRun

function summaryCounts(s: RunSummary): PerTableCounts {
  return { added: s.added, updated: s.updated, unchanged: s.unchanged, total: s.total }
}

/**
 * ADR-0014 policy α: a manual_curation brand row is considered
 * superseded by an incoming Sakenowa row when their
 * `(name_kanji, brewery_id)` pair matches. Returns the conflicts
 * found — empty array means clean ingest.
 *
 * Sakenowa's `name` field IS the Japanese-script form (what we
 * store as `name_kanji`), so the join key compares incoming `name`
 * against our `name_kanji`.
 */
export interface ManualBrandConflict {
  /** Existing manual_curation brand_id (>= 9_000_000 per ADR-0014). */
  manualBrandId: number
  /** Sakenowa brand_id that would supersede it. */
  sakenowaBrandId: number
  /** Identity tuple. */
  nameKanji: string
  breweryId: number
}

export async function detectManualBrandConflicts(
  incoming: ReadonlyArray<SakenowaBrand>,
  db: BrandsDB,
): Promise<ManualBrandConflict[]> {
  const keys = await db.getLiveManualBrandKeys()
  if (keys.size === 0) return []
  const conflicts: ManualBrandConflict[] = []
  for (const s of incoming) {
    const key = `${s.name}::${s.breweryId}`
    const manual = keys.get(key)
    if (manual) {
      conflicts.push({
        manualBrandId: manual.brandId,
        sakenowaBrandId: s.id,
        nameKanji: s.name,
        breweryId: s.breweryId,
      })
    }
  }
  return conflicts
}

function formatConflictError(conflicts: ReadonlyArray<ManualBrandConflict>): string {
  const lines = conflicts.map(
    (c) =>
      `  manual brand_id ${c.manualBrandId} (name_kanji=${c.nameKanji}, brewery_id=${c.breweryId}) ↔ Sakenowa brand_id ${c.sakenowaBrandId}`,
  )
  return (
    `${conflicts.length} manual-curation row(s) match newly-published Sakenowa rows on (name_kanji, brewery_id):\n` +
    lines.join('\n') +
    `\n\nReview the conflicts above and rerun with \`--supersede-confirmed\` (CLI) ` +
    `or \`{ supersedeConfirmed: true }\` (programmatic) to mark the manual rows ` +
    `superseded and apply the Sakenowa upsert. Per ADR-0014 policy α, ingest will ` +
    `not silently overwrite manual rows.`
  )
}

function rankingCounts(s: RankingRunSummary): PerTableCounts {
  return { total: s.total, yearMonth: s.yearMonth }
}

export async function driveIngest(
  deps: { sakenowa: SakenowaSource; dbs: IngestDriverDBs },
  options: DriveIngestOptions = {},
): Promise<IngestDriverResult> {
  const now = options.now ?? (() => new Date())
  const runId = options.runId ?? randomUUID()
  const startedAt = now()
  const perTable: IngestionRun['perTable'] = {}

  // Cached so `computeSourceRevisionHash` sees only what this invocation
  // actually fetched. If we crash before brands, brands stays undefined
  // and the hash reflects "we never asked Sakenowa for brands."
  let fetchedBreweries: SakenowaBrewery[] | undefined
  let fetchedBrands: SakenowaBrand[] | undefined
  let fetchedFlavorCharts: SakenowaFlavorChart[] | undefined
  let fetchedAreas: SakenowaArea[] | undefined
  let fetchedFlavorTags: SakenowaFlavorTag[] | undefined
  let fetchedRankings: SakenowaRankingsPayload | undefined

  let status: IngestionRun['status'] = 'success'
  let errorMessage: string | null = null

  const reportProgress = (table: TableLabel) => (current: number, total: number) =>
    options.onPerTableProgress?.(table, current, total)

  try {
    const brewerySummary = await ingestBreweries({
      client: {
        getBreweries: async () => {
          fetchedBreweries = await deps.sakenowa.getBreweries()
          return fetchedBreweries
        },
      },
      db: deps.dbs.breweries,
      onProgress: reportProgress('breweries'),
    })
    perTable.breweries = summaryCounts(brewerySummary)

    // Wrap the brand-fetch so the conflict-detection pass (ADR-0014
    // policy α) runs BEFORE the upsert, sees the same payload that
    // would be written, and can supersede or abort accordingly.
    const brandSummary = await ingestBrands({
      client: {
        getBrands: async () => {
          fetchedBrands = await deps.sakenowa.getBrands()
          const conflicts = await detectManualBrandConflicts(
            fetchedBrands,
            deps.dbs.brands,
          )
          if (conflicts.length > 0) {
            if (!options.supersedeConfirmed) {
              throw new Error(formatConflictError(conflicts))
            }
            await deps.dbs.brands.supersedeBrands(
              conflicts.map((c) => c.manualBrandId),
              startedAt,
            )
          }
          return fetchedBrands
        },
      },
      db: deps.dbs.brands,
      onProgress: reportProgress('brands'),
    })
    perTable.brands = summaryCounts(brandSummary)

    const flavorChartSummary = await ingestFlavorCharts({
      client: {
        getFlavorCharts: async () => {
          fetchedFlavorCharts = await deps.sakenowa.getFlavorCharts()
          return fetchedFlavorCharts
        },
      },
      db: deps.dbs.flavorCharts,
      onProgress: reportProgress('flavorCharts'),
    })
    perTable.flavorCharts = summaryCounts(flavorChartSummary)

    const areaSummary = await ingestAreas({
      client: {
        getAreas: async () => {
          fetchedAreas = await deps.sakenowa.getAreas()
          return fetchedAreas
        },
      },
      db: deps.dbs.areas,
      onProgress: reportProgress('areas'),
    })
    perTable.areas = summaryCounts(areaSummary)

    const tagSummary = await ingestFlavorTags({
      client: {
        getFlavorTags: async () => {
          fetchedFlavorTags = await deps.sakenowa.getFlavorTags()
          return fetchedFlavorTags
        },
      },
      db: deps.dbs.flavorTags,
      onProgress: reportProgress('flavorTags'),
    })
    perTable.flavorTags = summaryCounts(tagSummary)

    const rankingsSummary = await ingestRankings({
      client: {
        getRankings: async () => {
          fetchedRankings = await deps.sakenowa.getRankings()
          return fetchedRankings
        },
      },
      db: deps.dbs.rankings,
      onProgress: reportProgress('rankings'),
    })
    perTable.rankings = rankingCounts(rankingsSummary)
  } catch (err) {
    status = 'failed'
    errorMessage = err instanceof Error ? err.message : String(err)
  }

  const finishedAt = now()
  const sourceRevisionHash = computeSourceRevisionHash({
    brands: fetchedBrands,
    breweries: fetchedBreweries,
    flavorCharts: fetchedFlavorCharts,
    areas: fetchedAreas,
    flavorTags: fetchedFlavorTags,
    rankings: fetchedRankings,
  })

  // Telemetry write is wrapped — a failed write here MUST NOT mask the
  // pipeline status the caller is about to return. We surface it through
  // the result for the caller to log/swallow as it sees fit.
  try {
    await recordIngestionRun(deps.dbs.ingestionRuns, {
      runId,
      startedAt,
      finishedAt,
      status,
      perTable,
      sourceRevisionHash,
      errorMessage,
    })
  } catch (telemetryErr) {
    // Append rather than overwrite — the original pipeline error (if any)
    // is the operator-actionable one; the telemetry failure is context.
    const telemetryMsg =
      telemetryErr instanceof Error ? telemetryErr.message : String(telemetryErr)
    errorMessage = errorMessage
      ? `${errorMessage} (telemetry write failed: ${telemetryMsg})`
      : `telemetry write failed: ${telemetryMsg}`
    status = 'failed'
  }

  return {
    source: 'manual_curation',
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    status,
    perTable,
    sourceRevisionHash,
    errorMessage,
  }
}
