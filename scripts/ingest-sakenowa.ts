/**
 * CLI entry for `pnpm ingest` — refreshes Sakenowa reference data into the
 * Supabase brands + breweries tables via the ingestion pipeline. Exit code
 * mirrors pipeline success / failure: 0 on success, 1 on any error.
 *
 * Requires DATABASE_URL in env. Either set it in your shell, or invoke as
 * `tsx --env-file=.env.local scripts/ingest-sakenowa.ts`. The package.json
 * `ingest` script does the latter by default.
 *
 * Order matters: breweries first, then brands. brands.brewery_id is a real
 * FK to breweries.brewery_id (since slice 5 / 0002_breweries.sql), so
 * brands must see their breweries already committed.
 */
import { Pool } from 'pg'
import { getBrands, getBreweries, getFlavorCharts } from '../src/lib/sakenowa/client'
import {
  makePgBrandsDB,
  makePgBreweriesDB,
  makePgFlavorChartsDB,
} from '../src/lib/sakenowa/db'
import {
  ingestBrands,
  ingestBreweries,
  ingestFlavorCharts,
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

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.')
    return 1
  }

  const pool = new Pool({ connectionString })
  try {
    const startedAt = Date.now()

    const brewerySplit = Date.now()
    process.stdout.write('Breweries: fetching → classifying → writing…\n')
    const brewerySummary = await ingestBreweries({
      client: { getBreweries },
      db: makePgBreweriesDB(pool),
      onProgress: makeBarRenderer('  breweries write'),
    })
    console.log(
      `✓ breweries: ${brewerySummary.added} added, ${brewerySummary.updated} updated, ${brewerySummary.unchanged} unchanged (${brewerySummary.total} total) in ${Date.now() - brewerySplit}ms`,
    )

    const brandSplit = Date.now()
    process.stdout.write('Brands: fetching → classifying → writing…\n')
    const brandSummary = await ingestBrands({
      client: { getBrands },
      db: makePgBrandsDB(pool),
      onProgress: makeBarRenderer('  brands write'),
    })
    console.log(
      `✓ brands: ${brandSummary.added} added, ${brandSummary.updated} updated, ${brandSummary.unchanged} unchanged (${brandSummary.total} total) in ${Date.now() - brandSplit}ms`,
    )

    // flavor_charts FK against brands.brand_id (0004) — must run after
    // brands. Sakenowa publishes ~1.4k charts vs. ~3.2k brands; charts
    // for brands without a published flavor chart simply don't exist.
    const flavorChartSplit = Date.now()
    process.stdout.write('Flavor charts: fetching → classifying → writing…\n')
    const flavorChartSummary = await ingestFlavorCharts({
      client: { getFlavorCharts },
      db: makePgFlavorChartsDB(pool),
      onProgress: makeBarRenderer('  flavor_charts write'),
    })
    console.log(
      `✓ flavor_charts: ${flavorChartSummary.added} added, ${flavorChartSummary.updated} updated, ${flavorChartSummary.unchanged} unchanged (${flavorChartSummary.total} total) in ${Date.now() - flavorChartSplit}ms`,
    )

    console.log(`✓ done in ${Date.now() - startedAt}ms`)
    return 0
  } catch (err) {
    process.stdout.write('\n')
    console.error('✘ ingestion failed:', err instanceof Error ? err.message : err)
    if (err instanceof Error && err.stack) console.error(err.stack)
    return 1
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().then((code) => process.exit(code))
}
