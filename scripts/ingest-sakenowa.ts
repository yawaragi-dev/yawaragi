/**
 * CLI entry for `pnpm ingest` — refreshes Sakenowa reference data into
 * Supabase and writes one `ingestion_runs` telemetry row per invocation.
 * Exit code mirrors pipeline success / failure: 0 on success, 1 on any
 * error.
 *
 * Requires DATABASE_URL in env. Either set it in your shell, or invoke as
 * `tsx --env-file=.env.local scripts/ingest-sakenowa.ts`. The package.json
 * `ingest` script does the latter by default.
 *
 * Order matters for FKs:
 *   1. breweries  (no FK to Sakenowa tables)
 *   2. brands     (FK → breweries)
 *   3. areas      (forward-looking; breweries.area_id is loose-int, no FK
 *                  this slice — see PR notes)
 *   4. flavor_tags (no FK to Sakenowa tables)
 *   5. rankings   (FK → brands; must come after brands)
 *   6. ingestion_runs (telemetry; written in a finally block so a partial
 *                      failure still produces a row)
 */
import { Pool } from 'pg'
import {
  getAreas,
  getBrands,
  getBreweries,
  getFlavorCharts,
  getFlavorTags,
  getRankings,
  type SakenowaArea,
  type SakenowaBrand,
  type SakenowaBrewery,
  type SakenowaFlavorChart,
  type SakenowaFlavorTag,
  type SakenowaRankingsPayload,
} from '../src/lib/sakenowa/client'
import {
  makePgAreasDB,
  makePgBrandsDB,
  makePgBreweriesDB,
  makePgFlavorChartsDB,
  makePgFlavorTagsDB,
  makePgIngestionRunsDB,
  makePgRankingsDB,
  type PerTableCounts,
} from '../src/lib/sakenowa/db'
import type { IngestionRun } from '../src/lib/schemas/ingestion-run'
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
} from '../src/lib/sakenowa/ingestion-pipeline'

const BAR_WIDTH = 30
const THROTTLE_MS = 100

function makeBarRenderer(label: string): (current: number, total: number) => void {
  // Pure-TTY check: piping `pnpm ingest > log.txt` shouldn't spam carriage
  // returns into the file. Fall back to one terse line per 10% of progress.
  const isTty = Boolean(process.stdout.isTTY)
  let lastRenderAt = 0
  let lastBucket = -1

  return (current, total) => {
    const now = Date.now()
    const done = current === total
    if (!done && now - lastRenderAt < THROTTLE_MS && isTty) return

    const pct = total > 0 ? current / total : 1
    const pctInt = Math.floor(pct * 100)

    if (isTty) {
      const filled = Math.floor(pct * BAR_WIDTH)
      const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
      process.stdout.write(`\r${label} [${bar}] ${pctInt.toString().padStart(3)}%  ${current}/${total}`)
      if (done) process.stdout.write('\n')
    } else {
      // Non-TTY: emit once per 10% bucket to keep logs greppable.
      const bucket = Math.floor(pctInt / 10)
      if (bucket > lastBucket || done) {
        lastBucket = bucket
        process.stdout.write(`${label}: ${pctInt}% (${current}/${total})\n`)
      }
    }
    lastRenderAt = now
  }
}

function summaryCounts(s: RunSummary): PerTableCounts {
  return { added: s.added, updated: s.updated, unchanged: s.unchanged, total: s.total }
}

function rankingCounts(s: RankingRunSummary): PerTableCounts {
  return { total: s.total }
}

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.')
    return 1
  }

  // Telemetry pool is separate so the `ingestion_runs` write survives any
  // rollback / errored pool state from the data pool.
  const pool = new Pool({ connectionString })
  const telemetryPool = new Pool({ connectionString })

  const startedAt = new Date()
  const perTable: IngestionRun['perTable'] = {}
  // Cached Sakenowa payloads — recomputed only by ingestors that actually
  // ran. Used by computeSourceRevisionHash so the cron route (#54) sees
  // a stable fingerprint for "Sakenowa published new data."
  let fetchedBreweries: SakenowaBrewery[] | undefined
  let fetchedBrands: SakenowaBrand[] | undefined
  let fetchedFlavorCharts: SakenowaFlavorChart[] | undefined
  let fetchedAreas: SakenowaArea[] | undefined
  let fetchedFlavorTags: SakenowaFlavorTag[] | undefined
  let fetchedRankings: SakenowaRankingsPayload | undefined
  let errorMessage: string | null = null
  let status: 'success' | 'failed' = 'success'

  try {
    const brewerySplit = Date.now()
    process.stdout.write('Breweries: fetching → classifying → writing…\n')
    const brewerySummary = await ingestBreweries({
      client: {
        getBreweries: async () => {
          fetchedBreweries = await getBreweries()
          return fetchedBreweries
        },
      },
      db: makePgBreweriesDB(pool),
      onProgress: makeBarRenderer('  breweries write'),
    })
    perTable.breweries = summaryCounts(brewerySummary)
    console.log(
      `✓ breweries: ${brewerySummary.added} added, ${brewerySummary.updated} updated, ${brewerySummary.unchanged} unchanged (${brewerySummary.total} total) in ${Date.now() - brewerySplit}ms`,
    )

    const brandSplit = Date.now()
    process.stdout.write('Brands: fetching → classifying → writing…\n')
    const brandSummary = await ingestBrands({
      client: {
        getBrands: async () => {
          fetchedBrands = await getBrands()
          return fetchedBrands
        },
      },
      db: makePgBrandsDB(pool),
      onProgress: makeBarRenderer('  brands write'),
    })
    perTable.brands = summaryCounts(brandSummary)
    console.log(
      `✓ brands: ${brandSummary.added} added, ${brandSummary.updated} updated, ${brandSummary.unchanged} unchanged (${brandSummary.total} total) in ${Date.now() - brandSplit}ms`,
    )

    // flavor_charts FK against brands.brand_id (0004) — must run after
    // brands. Sakenowa publishes ~1.4k charts vs. ~3.2k brands; charts
    // for brands without a published flavor chart simply don't exist.
    const flavorChartSplit = Date.now()
    process.stdout.write('Flavor charts: fetching → classifying → writing…\n')
    const flavorChartSummary = await ingestFlavorCharts({
      client: {
        getFlavorCharts: async () => {
          fetchedFlavorCharts = await getFlavorCharts()
          return fetchedFlavorCharts
        },
      },
      db: makePgFlavorChartsDB(pool),
      onProgress: makeBarRenderer('  flavor_charts write'),
    })
    perTable.flavorCharts = summaryCounts(flavorChartSummary)
    console.log(
      `✓ flavor_charts: ${flavorChartSummary.added} added, ${flavorChartSummary.updated} updated, ${flavorChartSummary.unchanged} unchanged (${flavorChartSummary.total} total) in ${Date.now() - flavorChartSplit}ms`,
    )

    const areaSplit = Date.now()
    process.stdout.write('Areas: fetching → classifying → writing…\n')
    const areaSummary = await ingestAreas({
      client: {
        getAreas: async () => {
          fetchedAreas = await getAreas()
          return fetchedAreas
        },
      },
      db: makePgAreasDB(pool),
      onProgress: makeBarRenderer('  areas write'),
    })
    perTable.areas = summaryCounts(areaSummary)
    console.log(
      `✓ areas: ${areaSummary.added} added, ${areaSummary.updated} updated, ${areaSummary.unchanged} unchanged (${areaSummary.total} total) in ${Date.now() - areaSplit}ms`,
    )

    const tagSplit = Date.now()
    process.stdout.write('Flavor tags: fetching → classifying → writing…\n')
    const tagSummary = await ingestFlavorTags({
      client: {
        getFlavorTags: async () => {
          fetchedFlavorTags = await getFlavorTags()
          return fetchedFlavorTags
        },
      },
      db: makePgFlavorTagsDB(pool),
      onProgress: makeBarRenderer('  flavor_tags write'),
    })
    perTable.flavorTags = summaryCounts(tagSummary)
    console.log(
      `✓ flavor_tags: ${tagSummary.added} added, ${tagSummary.updated} updated, ${tagSummary.unchanged} unchanged (${tagSummary.total} total) in ${Date.now() - tagSplit}ms`,
    )

    const rankingsSplit = Date.now()
    process.stdout.write('Rankings: fetching → replacing snapshot…\n')
    const rankingsSummary = await ingestRankings({
      client: {
        getRankings: async () => {
          fetchedRankings = await getRankings()
          return fetchedRankings
        },
      },
      db: makePgRankingsDB(pool),
      onProgress: makeBarRenderer('  rankings write'),
    })
    perTable.rankings = rankingCounts(rankingsSummary)
    console.log(
      `✓ rankings: ${rankingsSummary.total} rows (yearMonth=${rankingsSummary.yearMonth}) in ${Date.now() - rankingsSplit}ms`,
    )

    console.log(`✓ done in ${Date.now() - startedAt.getTime()}ms`)
  } catch (err) {
    process.stdout.write('\n')
    status = 'failed'
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error('✘ ingestion failed:', errorMessage)
    if (err instanceof Error && err.stack) console.error(err.stack)
  } finally {
    const finishedAt = new Date()
    const sourceRevisionHash = computeSourceRevisionHash({
      brands: fetchedBrands,
      breweries: fetchedBreweries,
      flavorCharts: fetchedFlavorCharts,
      areas: fetchedAreas,
      flavorTags: fetchedFlavorTags,
      rankings: fetchedRankings,
    })
    try {
      await recordIngestionRun(makePgIngestionRunsDB(telemetryPool), {
        startedAt,
        finishedAt,
        status,
        perTable,
        sourceRevisionHash,
        errorMessage,
      })
    } catch (telemetryErr) {
      // The data run already succeeded or already failed loudly. A
      // telemetry write failure shouldn't change the exit code — but
      // we surface it so the operator knows the run wasn't recorded.
      console.error(
        '! ingestion_runs row write failed (run was otherwise',
        status + '):',
        telemetryErr instanceof Error ? telemetryErr.message : telemetryErr,
      )
    }
    await pool.end()
    await telemetryPool.end()
  }

  return status === 'success' ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().then((code) => process.exit(code))
}
