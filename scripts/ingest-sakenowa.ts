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
 * The sequencing logic lives in `driveIngest` (shared with the #54 cron
 * route at `src/app/api/cron/ingest/route.ts`). This script only owns:
 *   - pg.Pool lifecycle (data pool + separate telemetry pool)
 *   - Sakenowa HTTP client wiring
 *   - TTY progress rendering
 *   - stdout logging + process exit code
 */
import { Pool } from 'pg'
import {
  getAreas,
  getBrands,
  getBreweries,
  getFlavorCharts,
  getFlavorTags,
  getRankings,
} from '../src/lib/sakenowa/client'
import {
  makePgAreasDB,
  makePgBrandsDB,
  makePgBreweriesDB,
  makePgFlavorChartsDB,
  makePgFlavorTagsDB,
  makePgIngestionRunsDB,
  makePgRankingsDB,
} from '../src/lib/sakenowa/db'
import {
  driveIngest,
  type TableLabel,
} from '../src/lib/sakenowa/ingest-driver'

const BAR_WIDTH = 30
const THROTTLE_MS = 100

const TABLE_LABEL_TEXT: Record<TableLabel, string> = {
  breweries: 'breweries',
  brands: 'brands',
  flavorCharts: 'flavor_charts',
  areas: 'areas',
  flavorTags: 'flavor_tags',
  rankings: 'rankings',
}

interface BarRenderer {
  render: (current: number, total: number) => void
}

function makeBarRenderer(label: string): BarRenderer {
  // Pure-TTY check: piping `pnpm ingest > log.txt` shouldn't spam carriage
  // returns into the file. Fall back to one terse line per 10% of progress.
  const isTty = Boolean(process.stdout.isTTY)
  let lastRenderAt = 0
  let lastBucket = -1

  const render = (current: number, total: number): void => {
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

  return { render }
}

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.')
    return 1
  }

  // ADR-0014 policy α: when ingest detects that a fresh Sakenowa
  // row supersedes a manual_curation row (same name_kanji +
  // brewery_id), it aborts unless the operator opts in via
  // `--supersede-confirmed`. The flag flips manual rows to
  // `superseded_at = NOW()` and proceeds with the Sakenowa upsert.
  const supersedeConfirmed = process.argv.slice(2).includes('--supersede-confirmed')

  // Telemetry pool is separate so the `ingestion_runs` write survives any
  // rollback / errored pool state from the data pool.
  const pool = new Pool({ connectionString })
  const telemetryPool = new Pool({ connectionString })

  // One renderer per table label, lazily created so each "Fetching…"
  // line precedes its first bar paint.
  const renderers = new Map<TableLabel, BarRenderer>()
  const announced = new Set<TableLabel>()

  try {
    const result = await driveIngest(
      {
        sakenowa: { getBreweries, getBrands, getFlavorCharts, getAreas, getFlavorTags, getRankings },
        dbs: {
          breweries: makePgBreweriesDB(pool),
          brands: makePgBrandsDB(pool),
          flavorCharts: makePgFlavorChartsDB(pool),
          areas: makePgAreasDB(pool),
          flavorTags: makePgFlavorTagsDB(pool),
          rankings: makePgRankingsDB(pool),
          ingestionRuns: makePgIngestionRunsDB(telemetryPool),
        },
      },
      {
        onPerTableProgress: (table, current, total) => {
          if (!announced.has(table)) {
            announced.add(table)
            process.stdout.write(`${TABLE_LABEL_TEXT[table]}: writing…\n`)
          }
          let r = renderers.get(table)
          if (!r) {
            r = makeBarRenderer(`  ${TABLE_LABEL_TEXT[table]} write`)
            renderers.set(table, r)
          }
          r.render(current, total)
        },
        supersedeConfirmed,
      },
    )

    if (result.status === 'success') {
      for (const [key, counts] of Object.entries(result.perTable)) {
        if (!counts) continue
        const label = TABLE_LABEL_TEXT[key as TableLabel]
        if (key === 'rankings') {
          console.log(`✓ ${label}: ${counts.total} rows${counts.yearMonth ? ` (yearMonth=${counts.yearMonth})` : ''}`)
        } else {
          console.log(
            `✓ ${label}: ${counts.added ?? 0} added, ${counts.updated ?? 0} updated, ${counts.unchanged ?? 0} unchanged (${counts.total} total)`,
          )
        }
      }
      console.log(`✓ done (runId=${result.runId})`)
      return 0
    }

    process.stdout.write('\n')
    console.error('✘ ingestion failed:', result.errorMessage)
    return 1
  } finally {
    await pool.end()
    await telemetryPool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().then((code) => process.exit(code))
}
