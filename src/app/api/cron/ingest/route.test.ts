import { describe, expect, it, vi } from 'vitest'
import { handleCronIngestRequest, type CronRouteDeps } from './route'
import { driveIngest } from '@/lib/sakenowa/ingest-driver'
import type {
  AreasDB,
  BrandsDB,
  BreweriesDB,
  FlavorChartsDB,
  FlavorTagsDB,
  IngestionRunInsert,
  IngestionRunsDB,
  RankingsDB,
} from '@/lib/sakenowa/db'
import { parseIngestionRun } from '@/lib/schemas/ingestion-run'

const EXPECTED_SECRET = 'aaaaaaaaaaaaaaaa' // 16 chars, matches env.ts min

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/ingest', { method: 'POST', headers })
}

/**
 * A canned `IngestDriverResult` that round-trips through the schema —
 * stand-in for a real pipeline run when the route test doesn't care
 * about the actual ingest sequencing, only the HTTP layer.
 */
const cannedSuccessResult = parseIngestionRun({
  source: 'manual_curation',
  runId: '11111111-1111-4111-8111-111111111111',
  startedAt: '2026-05-29T10:00:00.000Z',
  finishedAt: '2026-05-29T10:00:45.000Z',
  status: 'success',
  perTable: { brands: { added: 1, updated: 0, unchanged: 0, total: 1 } },
  sourceRevisionHash: 'a'.repeat(64),
  errorMessage: null,
})

describe('POST /api/cron/ingest auth', () => {
  it('returns 401 and does NOT run the pipeline when the Authorization header is missing', async () => {
    const buildAndDrive = vi.fn()
    const deps: CronRouteDeps = { expectedSecret: EXPECTED_SECRET, buildAndDrive }

    const response = await handleCronIngestRequest(makeRequest(), () => deps)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
    expect(buildAndDrive).not.toHaveBeenCalled()
  })

  it('returns 401 and does NOT run the pipeline when the Authorization header lacks the Bearer prefix', async () => {
    const buildAndDrive = vi.fn()
    const deps: CronRouteDeps = { expectedSecret: EXPECTED_SECRET, buildAndDrive }

    // Just the secret, no "Bearer " prefix — common cron-config mistake.
    const response = await handleCronIngestRequest(
      makeRequest({ authorization: EXPECTED_SECRET }),
      () => deps,
    )

    expect(response.status).toBe(401)
    expect(buildAndDrive).not.toHaveBeenCalled()
  })

  it('returns 401 and does NOT run the pipeline when the secret is wrong (same length, exercises constant-time path)', async () => {
    const buildAndDrive = vi.fn()
    const deps: CronRouteDeps = { expectedSecret: EXPECTED_SECRET, buildAndDrive }
    // Same-length wrong secret forces the comparison through the
    // timingSafeEqual call rather than the early length-mismatch
    // short-circuit. If we ever swapped the helper for `===` this test
    // would still pass — the auth helper's own test file covers the
    // timing-side-channel guarantee directly.
    const wrong = 'b'.repeat(EXPECTED_SECRET.length)

    const response = await handleCronIngestRequest(
      makeRequest({ authorization: `Bearer ${wrong}` }),
      () => deps,
    )

    expect(response.status).toBe(401)
    expect(buildAndDrive).not.toHaveBeenCalled()
  })

  it('returns 401 for a non-empty Authorization header that is just whitespace', async () => {
    const buildAndDrive = vi.fn()
    const deps: CronRouteDeps = { expectedSecret: EXPECTED_SECRET, buildAndDrive }

    const response = await handleCronIngestRequest(
      makeRequest({ authorization: 'Bearer ' }),
      () => deps,
    )

    expect(response.status).toBe(401)
    expect(buildAndDrive).not.toHaveBeenCalled()
  })
})

describe('POST /api/cron/ingest unexpected throw', () => {
  it('returns 500 with a generic error when buildAndDrive throws before the pipeline can write telemetry', async () => {
    // Simulates a misconfiguration path — e.g. DATABASE_URL missing —
    // where pool construction throws BEFORE `driveIngest` runs. The
    // route mustn't return an unhandled rejection (which Next would
    // turn into an opaque 500 with no JSON body).
    const buildAndDrive = vi.fn(async () => {
      throw new Error('DATABASE_URL is not set — POST /api/cron/ingest cannot run.')
    })
    const deps: CronRouteDeps = { expectedSecret: EXPECTED_SECRET, buildAndDrive }

    const response = await handleCronIngestRequest(
      makeRequest({ authorization: `Bearer ${EXPECTED_SECRET}` }),
      () => deps,
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'DATABASE_URL is not set — POST /api/cron/ingest cannot run.',
      status: 'failed',
    })
  })
})

describe('POST /api/cron/ingest success', () => {
  it('returns 200 and a body that round-trips through parseIngestionRun', async () => {
    const buildAndDrive = vi.fn(async () => cannedSuccessResult)
    const deps: CronRouteDeps = { expectedSecret: EXPECTED_SECRET, buildAndDrive }

    const response = await handleCronIngestRequest(
      makeRequest({ authorization: `Bearer ${EXPECTED_SECRET}` }),
      () => deps,
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(buildAndDrive).toHaveBeenCalledTimes(1)
    // The point of this assertion: the wire response IS a valid
    // IngestionRun. If anyone ever ships a "summary" wrapper around it,
    // this test catches it.
    expect(() => parseIngestionRun(body)).not.toThrow()
    expect(parseIngestionRun(body)).toEqual(cannedSuccessResult)
  })
})

// ---------------------------------------------------------------
// End-to-end-ish failure test: real driveIngest wired against
// fake DBs and a Sakenowa source that throws at the first call.
// This is the only assertion in this file that the
// "telemetry row STILL gets written on pipeline failure"
// contract from slice 9's CLI is preserved by the route handler.
// ---------------------------------------------------------------

class FakeIngestionRunsDB implements IngestionRunsDB {
  rows: IngestionRunInsert[] = []
  async insertRun(run: IngestionRunInsert): Promise<void> {
    this.rows.push(run)
  }
}

function neverCalled(): never {
  throw new Error('fake DB method called unexpectedly — pipeline should have aborted earlier')
}

// All the data-table DBs throw if reached — we want the pipeline to
// crash at the FIRST call (`ingestBreweries`'s `getBreweries`), which
// blows up before any DB read.
const stubBreweriesDB: BreweriesDB = {
  async getExistingBreweryHashes() {
    return neverCalled()
  },
  async upsertBreweriesBatch() {
    neverCalled()
  },
  async transaction(fn) {
    return fn(this)
  },
}
const stubBrandsDB = stubBreweriesDB as unknown as BrandsDB
const stubFlavorChartsDB = stubBreweriesDB as unknown as FlavorChartsDB
const stubAreasDB = stubBreweriesDB as unknown as AreasDB
const stubFlavorTagsDB = stubBreweriesDB as unknown as FlavorTagsDB
const stubRankingsDB = stubBreweriesDB as unknown as RankingsDB

describe('POST /api/cron/ingest pipeline failure', () => {
  it('returns 500 with the error body AND still writes an ingestion_runs row with status="failed"', async () => {
    const telemetryDB = new FakeIngestionRunsDB()
    const throwingSakenowa = {
      getBreweries: async () => {
        throw new Error('Sakenowa /breweries returned 500')
      },
      getBrands: async () => [],
      getFlavorCharts: async () => [],
      getAreas: async () => [],
      getFlavorTags: async () => [],
      getRankings: async () => ({ yearMonth: '202402', overall: [], areas: [] }),
    }

    const deps: CronRouteDeps = {
      expectedSecret: EXPECTED_SECRET,
      buildAndDrive: () =>
        driveIngest({
          sakenowa: throwingSakenowa,
          dbs: {
            breweries: stubBreweriesDB,
            brands: stubBrandsDB,
            flavorCharts: stubFlavorChartsDB,
            areas: stubAreasDB,
            flavorTags: stubFlavorTagsDB,
            rankings: stubRankingsDB,
            ingestionRuns: telemetryDB,
          },
        }),
    }

    const response = await handleCronIngestRequest(
      makeRequest({ authorization: `Bearer ${EXPECTED_SECRET}` }),
      () => deps,
    )

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({
      status: 'failed',
      errorMessage: 'Sakenowa /breweries returned 500',
      error: 'Sakenowa /breweries returned 500',
    })

    // The contract from slice 9's CLI: one telemetry row, status='failed'.
    expect(telemetryDB.rows).toHaveLength(1)
    expect(telemetryDB.rows[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'Sakenowa /breweries returned 500',
    })
    // And the run's body sans the wire `error` field still round-trips.
    const { error: _err, ...wireRun } = body
    void _err
    expect(() => parseIngestionRun(wireRun)).not.toThrow()
  })
})
