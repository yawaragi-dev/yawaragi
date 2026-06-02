import 'server-only'
import { Pool } from 'pg'
import { env } from '@/env'
import {
  getAreas,
  getBrands,
  getBreweries,
  getFlavorCharts,
  getFlavorTags,
  getRankings,
} from '@/lib/sakenowa/client'
import {
  makePgAreasDB,
  makePgBrandsDB,
  makePgBreweriesDB,
  makePgFlavorChartsDB,
  makePgFlavorTagsDB,
  makePgIngestionRunsDB,
  makePgRankingsDB,
} from '@/lib/sakenowa/db'
import { driveIngest, type IngestDriverResult } from '@/lib/sakenowa/ingest-driver'
import { authorizeCronRequest } from '@/lib/cron/authorize'

/**
 * `POST /api/cron/ingest` — runs the full Sakenowa ingestion pipeline.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Header is checked via a
 * constant-time comparison (see `authorizeCronRequest`); failure returns
 * 401 BEFORE any pg.Pool is opened, so an unauthenticated probe never
 * touches the database.
 *
 * Response: success → 200 with the `IngestionRun` JSON (round-trips
 * through `parseIngestionRun`). Failure → 500 with the same shape plus
 * an `error` field carrying the pipeline message. Either way an
 * `ingestion_runs` row is persisted via a separate telemetry pool —
 * mirrors the CLI guarantee.
 *
 * Routes are server-only by definition; the `import 'server-only'` is
 * belt-and-braces in case someone accidentally re-exports from a
 * client module.
 */

// Force Node runtime: pg + node:crypto don't run on the Edge runtime.
export const runtime = 'nodejs'

// Long pipeline: HTTP-cached responses would be wrong here.
export const dynamic = 'force-dynamic'

/**
 * Two-stage so pool construction is deferred until after auth. Stage 1
 * (`expectedSecret`) is cheap (env read); stage 2 (`buildAndDrive`) is
 * called only if auth passes and is responsible for both running the
 * pipeline AND releasing whatever resources it opened (pools, sockets).
 */
export interface CronRouteDeps {
  expectedSecret: string
  buildAndDrive: () => Promise<IngestDriverResult>
}

export type CreateCronRouteDeps = () => CronRouteDeps

const RESPONSE_HEADERS = { 'Cache-Control': 'no-store' } as const

function unauthorized(): Response {
  // Same response shape and status for every auth failure mode. Surface
  // a 401 with a generic body — disclosing whether the failure was
  // missing vs. malformed vs. wrong-secret would leak information to an
  // attacker and serves no legitimate consumer.
  return Response.json({ error: 'unauthorized' }, { status: 401, headers: RESPONSE_HEADERS })
}

export async function handleCronIngestRequest(
  request: Request,
  createDeps: CreateCronRouteDeps,
): Promise<Response> {
  const headerValue = request.headers.get('authorization')
  const deps = createDeps()
  const authResult = authorizeCronRequest(headerValue, deps.expectedSecret)
  if (!authResult.ok) return unauthorized()

  // `driveIngest` (the production path) catches pipeline errors and
  // returns `status: 'failed'` rather than throwing, so the common path
  // here is a single await + branch on status. A throw IS still possible
  // for misconfiguration before the pipeline starts (e.g. missing
  // DATABASE_URL) — those become a generic 500 rather than crashing the
  // route runtime with an uncaught rejection.
  let result: IngestDriverResult
  try {
    result = await deps.buildAndDrive()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { error: message, status: 'failed' },
      { status: 500, headers: RESPONSE_HEADERS },
    )
  }
  const status = result.status === 'success' ? 200 : 500
  if (result.status === 'success') {
    return Response.json(result, { status, headers: RESPONSE_HEADERS })
  }
  return Response.json(
    { ...result, error: result.errorMessage ?? 'ingestion failed' },
    { status, headers: RESPONSE_HEADERS },
  )
}

/**
 * Production deps factory — wires `driveIngest` to real pg.Pools (one
 * for data, one for telemetry per slice 9) and the real Sakenowa
 * client. The pools are constructed lazily inside `buildAndDrive` so
 * an unauthenticated probe never opens a Postgres connection — auth
 * runs first against `expectedSecret`, which is just an env read.
 */
export function createProductionDeps(): CronRouteDeps {
  return {
    expectedSecret: env.CRON_SECRET,
    buildAndDrive: async () => {
      if (!env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set — POST /api/cron/ingest cannot run.')
      }
      const dataPool = new Pool({ connectionString: env.DATABASE_URL })
      const telemetryPool = new Pool({ connectionString: env.DATABASE_URL })
      try {
        return await driveIngest({
          sakenowa: {
            getBreweries,
            getBrands,
            getFlavorCharts,
            getAreas,
            getFlavorTags,
            getRankings,
          },
          dbs: {
            breweries: makePgBreweriesDB(dataPool),
            brands: makePgBrandsDB(dataPool),
            flavorCharts: makePgFlavorChartsDB(dataPool),
            areas: makePgAreasDB(dataPool),
            flavorTags: makePgFlavorTagsDB(dataPool),
            rankings: makePgRankingsDB(dataPool),
            ingestionRuns: makePgIngestionRunsDB(telemetryPool),
          },
        })
      } finally {
        // End both pools regardless of which threw — allSettled because
        // one pool's end() failure shouldn't mask the other (or the
        // pipeline error, if there was one).
        await Promise.allSettled([dataPool.end(), telemetryPool.end()])
      }
    },
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleCronIngestRequest(request, createProductionDeps)
}

// Vercel Cron invokes scheduled endpoints with GET, not POST. Without this
// alias every scheduled fire 405s and no `ingestion_runs` row is written
// (auth + telemetry never run). POST stays exported so manual smoke and
// the local CLI keep their semantically-correct mutating method.
export const GET = POST
