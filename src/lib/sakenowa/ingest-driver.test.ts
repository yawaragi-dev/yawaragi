import { describe, expect, it } from 'vitest'
import { driveIngest, type IngestDriverDBs, type SakenowaSource } from './ingest-driver'
import type { BrandFlavorTagsDB, IngestionRunInsert } from './db'
import type { BrandFlavorTag } from '../schemas/brand-flavor-tag'

/** Every per-table DB as one object that holds nothing and writes nothing. */
function emptyTableDB() {
  const db = {
    getExistingBrandHashes: async () => new Map(),
    getExistingBreweryHashes: async () => new Map(),
    getExistingFlavorChartHashes: async () => new Map(),
    getExistingAreaHashes: async () => new Map(),
    getExistingFlavorTagHashes: async () => new Map(),
    getLiveManualBrandKeys: async () => new Map(),
    upsertBrandsBatch: async () => {},
    upsertBreweriesBatch: async () => {},
    upsertFlavorChartsBatch: async () => {},
    upsertAreasBatch: async () => {},
    upsertFlavorTagsBatch: async () => {},
    getKnownBrandIds: async () => new Set<number>(),
    replaceAll: async () => {},
    transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn(db),
  }
  return db
}

const sakenowa: SakenowaSource = {
  getBreweries: async () => [],
  getBrands: async () => [],
  getFlavorCharts: async () => [],
  getAreas: async () => [],
  getFlavorTags: async () => [],
  getRankings: async () => ({ yearMonth: '202610', overall: [], areas: [] }),
  getBrandFlavorTags: async () => [{ brandId: 2, tagIds: [109] }],
}

function dbs(brandFlavorTags: BrandFlavorTagsDB) {
  const runs: IngestionRunInsert[] = []
  const table = emptyTableDB() as never
  const all: IngestDriverDBs = {
    breweries: table,
    brands: table,
    flavorCharts: table,
    areas: table,
    flavorTags: table,
    rankings: table,
    brandFlavorTags,
    ingestionRuns: {
      insertRun: async (run) => {
        runs.push(run)
      },
    },
  }
  return { all, runs }
}

function brandFlavorTagsDB(
  replaceAll: (rows: readonly BrandFlavorTag[]) => Promise<void>,
): BrandFlavorTagsDB {
  const db: BrandFlavorTagsDB = {
    getKnownBrandIds: async () => new Set([2]),
    getKnownTagIds: async () => new Set([109]),
    replaceAll,
    transaction: (fn) => fn(db),
  }
  return db
}

describe('driveIngest — brand flavor tags', () => {
  it('writes the brand–tag pairs after the tables they point at, and reports the count', async () => {
    const written: BrandFlavorTag[] = []
    const { all, runs } = dbs(
      brandFlavorTagsDB(async (rows) => {
        written.push(...rows)
      }),
    )

    const result = await driveIngest({ sakenowa, dbs: all })

    expect(result.status).toBe('success')
    expect(written).toEqual([{ brandId: 2, tagId: 109, position: 1, source: 'sakenowa' }])
    expect(result.perTable.brandFlavorTags).toEqual({ total: 1 })
    expect(runs).toHaveLength(1)
  })

  it('skips the step, and still succeeds, while migration 0020 has not been applied', async () => {
    // The daily cron may run on the new code before `pnpm migrate`: a failed
    // run every night for a table nothing else depends on would be noise.
    const missingTable = Object.assign(new Error('relation "brand_flavor_tags" does not exist'), {
      code: '42P01',
    })
    const { all } = dbs(
      brandFlavorTagsDB(async () => {
        throw missingTable
      }),
    )

    const result = await driveIngest({ sakenowa, dbs: all })

    expect(result.status).toBe('success')
    expect(result.perTable.brandFlavorTags).toEqual({ total: 0, skipped: 'table_missing' })
    expect(result.perTable.rankings).toBeDefined()
  })

  it('fails the run on any other database error', async () => {
    const { all } = dbs(
      brandFlavorTagsDB(async () => {
        throw new Error('connection reset')
      }),
    )

    const result = await driveIngest({ sakenowa, dbs: all })

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toContain('connection reset')
  })
})
