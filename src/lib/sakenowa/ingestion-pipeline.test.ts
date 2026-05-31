import { describe, expect, it } from 'vitest'
import {
  computeAreaContentHash,
  computeBreweryContentHash,
  computeContentHash,
  computeFlavorChartContentHash,
  computeFlavorTagContentHash,
  computeSourceRevisionHash,
  ingestAreas,
  ingestBrands,
  ingestBreweries,
  ingestFlavorCharts,
  ingestFlavorTags,
  ingestRankings,
  recordIngestionRun,
  sakenowaAreaToArea,
  sakenowaBrandToBrand,
  sakenowaBreweryToBrewery,
  sakenowaFlavorChartToFlavorChart,
  sakenowaFlavorTagToFlavorTag,
  sakenowaRankingsToRankings,
  type AreaIngestionDeps,
  type BreweryIngestionDeps,
  type FlavorChartIngestionDeps,
  type FlavorTagIngestionDeps,
  type IngestionDeps,
  type RankingIngestionDeps,
} from './ingestion-pipeline'
import type { Area } from '../schemas/area'
import type { Brand } from '../schemas/brand'
import type { Brewery } from '../schemas/brewery'
import type { FlavorChart } from '../schemas/flavor-chart'
import type { FlavorTag } from '../schemas/flavor-tag'
import type { Ranking } from '../schemas/ranking'
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
  AreaUpsert,
  BrandsDB,
  BreweriesDB,
  FlavorChartsDB,
  FlavorTagsDB,
  FlavorTagUpsert,
  IngestionRunInsert,
  IngestionRunsDB,
  RankingsDB,
} from './db'

class FakeBrandsDB implements BrandsDB {
  rows = new Map<number, { brand: Brand; hash: string }>()
  // Counts the number of rows actually written across all batch calls,
  // so existing test assertions (`expect(db.upsertCalls).toBe(N)`) keep
  // their original meaning under the batched API.
  upsertCalls = 0
  batchCalls = 0
  txOpened = 0
  txCompleted = 0

  async getExistingBrandHashes(): Promise<Map<number, string>> {
    return new Map(Array.from(this.rows.entries()).map(([id, v]) => [id, v.hash]))
  }

  async upsertBrandsBatch(
    rows: readonly { brand: Brand; contentHash: string }[],
    onChunk?: (rowsThisChunk: number) => void,
  ): Promise<void> {
    if (rows.length === 0) return
    this.batchCalls++
    for (const { brand, contentHash } of rows) {
      this.upsertCalls++
      this.rows.set(brand.brandId, { brand, hash: contentHash })
    }
    onChunk?.(rows.length)
  }

  async transaction<T>(fn: (tx: BrandsDB) => Promise<T>): Promise<T> {
    this.txOpened++
    const result = await fn(this)
    this.txCompleted++
    return result
  }
}

const makeClient = (brands: SakenowaBrand[] | Error): IngestionDeps['client'] => ({
  getBrands: async () => {
    if (brands instanceof Error) throw brands
    return brands
  },
})

const sBrand = (
  overrides: Partial<SakenowaBrand> = {},
): SakenowaBrand => ({ id: 1, name: '麗人', breweryId: 49, ...overrides })

describe('sakenowaBrandToBrand', () => {
  it('stamps source: "sakenowa" and mirrors name into both fields', () => {
    expect(sakenowaBrandToBrand(sBrand())).toEqual({
      brandId: 1,
      name: '麗人',
      nameKanji: '麗人',
      breweryId: 49,
      source: 'sakenowa',
    })
  })
})

describe('computeContentHash', () => {
  const base: Brand = {
    brandId: 1,
    name: 'Reijin',
    nameKanji: '麗人',
    breweryId: 49,
    source: 'sakenowa',
  }

  it('is deterministic across calls with identical input', () => {
    expect(computeContentHash(base)).toBe(computeContentHash(base))
  })

  it('changes when any canonical field changes', () => {
    const h0 = computeContentHash(base)
    expect(computeContentHash({ ...base, name: 'Different' })).not.toBe(h0)
    expect(computeContentHash({ ...base, nameKanji: '別' })).not.toBe(h0)
    expect(computeContentHash({ ...base, breweryId: 50 })).not.toBe(h0)
    expect(computeContentHash({ ...base, source: 'manual_curation' })).not.toBe(h0)
    expect(computeContentHash({ ...base, confidence: 0.5 })).not.toBe(h0)
  })

  it('treats missing confidence and confidence: undefined identically', () => {
    expect(computeContentHash({ ...base })).toBe(
      computeContentHash({ ...base, confidence: undefined }),
    )
  })
})

describe('ingestBrands', () => {
  it('on an empty existing DB, classifies every brand as "added"', async () => {
    const db = new FakeBrandsDB()
    const summary = await ingestBrands({
      client: makeClient([sBrand({ id: 1 }), sBrand({ id: 2, name: '十四代', breweryId: 100 })]),
      db,
    })
    expect(summary).toEqual({ added: 2, updated: 0, unchanged: 0, total: 2 })
    expect(db.upsertCalls).toBe(2)
    expect(db.rows.size).toBe(2)
  })

  it('is idempotent — second run on identical source data writes zero rows', async () => {
    const db = new FakeBrandsDB()
    const brands = [sBrand({ id: 1 }), sBrand({ id: 2, name: '十四代', breweryId: 100 })]
    await ingestBrands({ client: makeClient(brands), db })
    db.upsertCalls = 0

    const summary = await ingestBrands({ client: makeClient(brands), db })

    expect(summary).toEqual({ added: 0, updated: 0, unchanged: 2, total: 2 })
    expect(db.upsertCalls).toBe(0)
  })

  it('classifies a Sakenowa-side mutation as "updated"', async () => {
    const db = new FakeBrandsDB()
    await ingestBrands({ client: makeClient([sBrand({ id: 1 })]), db })
    db.upsertCalls = 0

    const summary = await ingestBrands({
      client: makeClient([sBrand({ id: 1, name: '麗人 (改名)' })]),
      db,
    })

    expect(summary).toEqual({ added: 0, updated: 1, unchanged: 0, total: 1 })
    expect(db.upsertCalls).toBe(1)
  })

  it('mixes added + updated + unchanged in a single run', async () => {
    const db = new FakeBrandsDB()
    // Seed
    await ingestBrands({
      client: makeClient([
        sBrand({ id: 1, name: '麗人' }),
        sBrand({ id: 2, name: '十四代', breweryId: 100 }),
      ]),
      db,
    })
    db.upsertCalls = 0

    // Second run: id 1 unchanged, id 2 renamed (update), id 3 new (add)
    const summary = await ingestBrands({
      client: makeClient([
        sBrand({ id: 1, name: '麗人' }),
        sBrand({ id: 2, name: '十四代 (旧)', breweryId: 100 }),
        sBrand({ id: 3, name: '獺祭', breweryId: 200 }),
      ]),
      db,
    })

    expect(summary).toEqual({ added: 1, updated: 1, unchanged: 1, total: 3 })
    expect(db.upsertCalls).toBe(2)
  })

  it('propagates client errors without opening a transaction', async () => {
    const db = new FakeBrandsDB()
    const failure = new Error('Sakenowa offline')

    await expect(ingestBrands({ client: makeClient(failure), db })).rejects.toThrow(
      'Sakenowa offline',
    )

    expect(db.txOpened).toBe(0)
    expect(db.upsertCalls).toBe(0)
  })

  it('always runs inside a transaction', async () => {
    const db = new FakeBrandsDB()
    await ingestBrands({ client: makeClient([sBrand()]), db })
    expect(db.txOpened).toBe(1)
    expect(db.txCompleted).toBe(1)
  })

  it('wraps batch upsert errors with the count + PG detail (which carries the offending key)', async () => {
    // PG's error.detail typically reads like "Key (brewery_id)=(123) is
    // not present in table breweries" for FK violations. We forward
    // that verbatim so the operator sees which row is broken, without
    // forcing the pipeline to do a per-row retry on the happy path.
    class FailingDB extends FakeBrandsDB {
      override async upsertBrandsBatch(): Promise<void> {
        const err = new Error('insert or update violates foreign key constraint') as Error & {
          detail?: string
          code?: string
        }
        err.detail = 'Key (brewery_id)=(1147) is not present in table "breweries"'
        err.code = '23503'
        throw err
      }
    }
    const db = new FailingDB()

    const promise = ingestBrands({
      client: makeClient([sBrand({ id: 6478, breweryId: 1147 })]),
      db,
    })
    await expect(promise).rejects.toThrow(/Failed to upsert 1 brand row/)
    await expect(promise).rejects.toThrow(/code=23503/)
    await expect(promise).rejects.toThrow(/Key \(brewery_id\)=\(1147\)/)
  })

  it('invokes onProgress per write chunk with cumulative (rowsWritten, totalToWrite)', async () => {
    const db = new FakeBrandsDB()
    const calls: Array<[number, number]> = []
    await ingestBrands({
      client: makeClient([sBrand({ id: 1 }), sBrand({ id: 2, name: '十四代' }), sBrand({ id: 3, name: '獺祭' })]),
      db,
      onProgress: (current, total) => calls.push([current, total]),
    })
    // Fake writes the whole batch in one chunk → one progress tick at the end.
    expect(calls).toEqual([[3, 3]])
  })

  it('does not invoke onProgress on a fully-idempotent re-run (nothing to write)', async () => {
    const db = new FakeBrandsDB()
    const brands = [sBrand({ id: 1 }), sBrand({ id: 2 })]
    await ingestBrands({ client: makeClient(brands), db })
    const calls: Array<[number, number]> = []

    const summary = await ingestBrands({
      client: makeClient(brands),
      db,
      onProgress: (current, total) => calls.push([current, total]),
    })

    expect(summary).toMatchObject({ unchanged: 2 })
    expect(calls).toEqual([])
  })
})

class FakeBreweriesDB implements BreweriesDB {
  rows = new Map<number, { brewery: Brewery; hash: string }>()
  upsertCalls = 0
  batchCalls = 0
  txOpened = 0
  txCompleted = 0

  async getExistingBreweryHashes(): Promise<Map<number, string>> {
    return new Map(Array.from(this.rows.entries()).map(([id, v]) => [id, v.hash]))
  }

  async upsertBreweriesBatch(
    rows: readonly { brewery: Brewery; contentHash: string }[],
    onChunk?: (rowsThisChunk: number) => void,
  ): Promise<void> {
    if (rows.length === 0) return
    this.batchCalls++
    for (const { brewery, contentHash } of rows) {
      this.upsertCalls++
      this.rows.set(brewery.breweryId, { brewery, hash: contentHash })
    }
    onChunk?.(rows.length)
  }

  async transaction<T>(fn: (tx: BreweriesDB) => Promise<T>): Promise<T> {
    this.txOpened++
    const result = await fn(this)
    this.txCompleted++
    return result
  }
}

const makeBreweryClient = (
  breweries: SakenowaBrewery[] | Error,
): BreweryIngestionDeps['client'] => ({
  getBreweries: async () => {
    if (breweries instanceof Error) throw breweries
    return breweries
  },
})

const sBrewery = (overrides: Partial<SakenowaBrewery> = {}): SakenowaBrewery => ({
  id: 49,
  name: '麗人酒造',
  areaId: 20,
  ...overrides,
})

describe('sakenowaBreweryToBrewery', () => {
  it('stamps source: "sakenowa" and mirrors name into both fields', () => {
    expect(sakenowaBreweryToBrewery(sBrewery())).toEqual({
      breweryId: 49,
      name: '麗人酒造',
      nameKanji: '麗人酒造',
      areaId: 20,
      source: 'sakenowa',
    })
  })
})

describe('computeBreweryContentHash', () => {
  const base: Brewery = {
    breweryId: 49,
    name: 'Reijin Shuzo',
    nameKanji: '麗人酒造',
    areaId: 20,
    source: 'sakenowa',
  }

  it('is deterministic across calls with identical input', () => {
    expect(computeBreweryContentHash(base)).toBe(computeBreweryContentHash(base))
  })

  it('changes when any canonical field changes', () => {
    const h0 = computeBreweryContentHash(base)
    expect(computeBreweryContentHash({ ...base, name: 'Different' })).not.toBe(h0)
    expect(computeBreweryContentHash({ ...base, nameKanji: '別' })).not.toBe(h0)
    expect(computeBreweryContentHash({ ...base, areaId: 21 })).not.toBe(h0)
    expect(computeBreweryContentHash({ ...base, source: 'manual_curation' })).not.toBe(h0)
    expect(computeBreweryContentHash({ ...base, confidence: 0.5 })).not.toBe(h0)
  })

  it('does not collide with the brand content-hash for structurally similar input', () => {
    // Guards against a future refactor that accidentally reuses the brand
    // canonical form (which has `brandId` + `breweryId` keys instead of
    // `breweryId` + `areaId`) and lets a brand row's hash silently match
    // a brewery row's hash.
    const brandLike: Brand = {
      brandId: 49,
      name: 'Reijin Shuzo',
      nameKanji: '麗人酒造',
      breweryId: 20,
      source: 'sakenowa',
    }
    expect(computeBreweryContentHash(base)).not.toBe(computeContentHash(brandLike))
  })
})

describe('ingestBreweries', () => {
  it('on an empty existing DB, classifies every brewery as "added"', async () => {
    const db = new FakeBreweriesDB()
    const summary = await ingestBreweries({
      client: makeBreweryClient([sBrewery({ id: 49 }), sBrewery({ id: 100, name: '高木酒造', areaId: 6 })]),
      db,
    })
    expect(summary).toEqual({ added: 2, updated: 0, unchanged: 0, total: 2 })
    expect(db.upsertCalls).toBe(2)
    expect(db.rows.size).toBe(2)
  })

  it('is idempotent — second run on identical source data writes zero rows', async () => {
    const db = new FakeBreweriesDB()
    const breweries = [sBrewery({ id: 49 }), sBrewery({ id: 100, name: '高木酒造', areaId: 6 })]
    await ingestBreweries({ client: makeBreweryClient(breweries), db })
    db.upsertCalls = 0

    const summary = await ingestBreweries({ client: makeBreweryClient(breweries), db })

    expect(summary).toEqual({ added: 0, updated: 0, unchanged: 2, total: 2 })
    expect(db.upsertCalls).toBe(0)
  })

  it('classifies a Sakenowa-side mutation as "updated"', async () => {
    const db = new FakeBreweriesDB()
    await ingestBreweries({ client: makeBreweryClient([sBrewery({ id: 49 })]), db })
    db.upsertCalls = 0

    const summary = await ingestBreweries({
      client: makeBreweryClient([sBrewery({ id: 49, name: '麗人酒造 (改名)' })]),
      db,
    })

    expect(summary).toEqual({ added: 0, updated: 1, unchanged: 0, total: 1 })
    expect(db.upsertCalls).toBe(1)
  })

  it('propagates client errors without opening a transaction', async () => {
    const db = new FakeBreweriesDB()
    const failure = new Error('Sakenowa offline')

    await expect(ingestBreweries({ client: makeBreweryClient(failure), db })).rejects.toThrow(
      'Sakenowa offline',
    )

    expect(db.txOpened).toBe(0)
    expect(db.upsertCalls).toBe(0)
  })

  it('always runs inside a transaction', async () => {
    const db = new FakeBreweriesDB()
    await ingestBreweries({ client: makeBreweryClient([sBrewery()]), db })
    expect(db.txOpened).toBe(1)
    expect(db.txCompleted).toBe(1)
  })

  it('wraps batch upsert errors with the count + PG detail', async () => {
    class FailingDB extends FakeBreweriesDB {
      override async upsertBreweriesBatch(): Promise<void> {
        const err = new Error('new row violates check constraint') as Error & {
          detail?: string
          constraint?: string
        }
        err.detail = 'Failing row contains (1147, , , 0, sakenowa, null, hash).'
        err.constraint = 'breweries_name_check'
        throw err
      }
    }
    const db = new FailingDB()

    const promise = ingestBreweries({
      client: makeBreweryClient([sBrewery({ id: 1147, areaId: 0 })]),
      db,
    })
    await expect(promise).rejects.toThrow(/Failed to upsert 1 brewery row/)
    await expect(promise).rejects.toThrow(/constraint=breweries_name_check/)
  })

  it('invokes onProgress per write chunk with cumulative (rowsWritten, totalToWrite)', async () => {
    const db = new FakeBreweriesDB()
    const calls: Array<[number, number]> = []
    await ingestBreweries({
      client: makeBreweryClient([sBrewery({ id: 1 }), sBrewery({ id: 2 }), sBrewery({ id: 3 })]),
      db,
      onProgress: (current, total) => calls.push([current, total]),
    })
    expect(calls).toEqual([[3, 3]])
  })
})

// ============================================================
// FlavorCharts
// ============================================================

class FakeFlavorChartsDB implements FlavorChartsDB {
  rows = new Map<number, { flavorChart: FlavorChart; hash: string }>()
  upsertCalls = 0
  batchCalls = 0
  txOpened = 0
  txCompleted = 0

  async getExistingFlavorChartHashes(): Promise<Map<number, string>> {
    return new Map(Array.from(this.rows.entries()).map(([id, v]) => [id, v.hash]))
  }

  async upsertFlavorChartsBatch(
    rows: readonly { flavorChart: FlavorChart; contentHash: string }[],
    onChunk?: (rowsThisChunk: number) => void,
  ): Promise<void> {
    if (rows.length === 0) return
    this.batchCalls++
    for (const { flavorChart, contentHash } of rows) {
      this.upsertCalls++
      this.rows.set(flavorChart.brandId, { flavorChart, hash: contentHash })
    }
    onChunk?.(rows.length)
  }

  async transaction<T>(fn: (tx: FlavorChartsDB) => Promise<T>): Promise<T> {
    this.txOpened++
    const result = await fn(this)
    this.txCompleted++
    return result
  }
}

// ============================================================
// Areas
// ============================================================

class FakeAreasDB implements AreasDB {
  rows = new Map<number, { area: Area; hash: string }>()
  upsertCalls = 0
  batchCalls = 0
  txOpened = 0
  txCompleted = 0

  async getExistingAreaHashes(): Promise<Map<number, string>> {
    return new Map(Array.from(this.rows.entries()).map(([id, v]) => [id, v.hash]))
  }

  async upsertAreasBatch(rows: readonly AreaUpsert[], onChunk?: (n: number) => void): Promise<void> {
    if (rows.length === 0) return
    this.batchCalls++
    for (const { area, contentHash } of rows) {
      this.upsertCalls++
      this.rows.set(area.areaId, { area, hash: contentHash })
    }
    onChunk?.(rows.length)
  }

  async transaction<T>(fn: (tx: AreasDB) => Promise<T>): Promise<T> {
    this.txOpened++
    const result = await fn(this)
    this.txCompleted++
    return result
  }
}

const makeFlavorChartClient = (
  charts: SakenowaFlavorChart[] | Error,
): FlavorChartIngestionDeps['client'] => ({
  getFlavorCharts: async () => {
    if (charts instanceof Error) throw charts
    return charts
  },
})

const sChart = (overrides: Partial<SakenowaFlavorChart> = {}): SakenowaFlavorChart => ({
  brandId: 2,
  f1: 0.27,
  f2: 0.51,
  f3: 0.31,
  f4: 0.42,
  f5: 0.46,
  f6: 0.42,
  ...overrides,
})

describe('sakenowaFlavorChartToFlavorChart', () => {
  it('stamps source: "sakenowa" and preserves all six axes', () => {
    expect(sakenowaFlavorChartToFlavorChart(sChart())).toEqual({
      brandId: 2,
      f1: 0.27,
      f2: 0.51,
      f3: 0.31,
      f4: 0.42,
      f5: 0.46,
      f6: 0.42,
      source: 'sakenowa',
    })
  })
})

const sArea = (overrides: Partial<SakenowaArea> = {}): SakenowaArea => ({
  id: 20,
  name: '長野県',
  ...overrides,
})

const makeAreaClient = (areas: SakenowaArea[] | Error): AreaIngestionDeps['client'] => ({
  getAreas: async () => {
    if (areas instanceof Error) throw areas
    return areas
  },
})

describe('sakenowaAreaToArea', () => {
  it('stamps source: "sakenowa"', () => {
    expect(sakenowaAreaToArea(sArea())).toEqual({
      areaId: 20,
      name: '長野県',
      source: 'sakenowa',
    })
  })

  it('preserves areaId 0 (foreign-producer sentinel)', () => {
    expect(sakenowaAreaToArea(sArea({ id: 0, name: 'その他' }))).toMatchObject({ areaId: 0 })
  })
})

describe('computeAreaContentHash', () => {
  const base: Area = { areaId: 20, name: '長野県', source: 'sakenowa' }

  it('is deterministic across calls with identical input', () => {
    expect(computeAreaContentHash(base)).toBe(computeAreaContentHash(base))
  })

  it('changes when any canonical field changes', () => {
    const h0 = computeAreaContentHash(base)
    expect(computeAreaContentHash({ ...base, name: 'Nagano' })).not.toBe(h0)
    expect(computeAreaContentHash({ ...base, source: 'manual_curation' })).not.toBe(h0)
  })
})

describe('ingestAreas', () => {
  it('classifies new areas as "added" on an empty DB', async () => {
    const db = new FakeAreasDB()
    const summary = await ingestAreas({
      client: makeAreaClient([sArea({ id: 1, name: '北海道' }), sArea({ id: 20 })]),
      db,
    })
    expect(summary).toEqual({ added: 2, updated: 0, unchanged: 0, total: 2 })
    expect(db.rows.size).toBe(2)
  })

  it('is idempotent — second run writes zero rows', async () => {
    const db = new FakeAreasDB()
    const areas = [sArea({ id: 1, name: '北海道' }), sArea({ id: 20 })]
    await ingestAreas({ client: makeAreaClient(areas), db })
    db.upsertCalls = 0

    const summary = await ingestAreas({ client: makeAreaClient(areas), db })
    expect(summary).toEqual({ added: 0, updated: 0, unchanged: 2, total: 2 })
    expect(db.upsertCalls).toBe(0)
  })

  it('classifies a Sakenowa-side rename as "updated"', async () => {
    const db = new FakeAreasDB()
    await ingestAreas({ client: makeAreaClient([sArea({ id: 20, name: '長野県' })]), db })
    const summary = await ingestAreas({
      client: makeAreaClient([sArea({ id: 20, name: '長野県 (旧)' })]),
      db,
    })
    expect(summary).toEqual({ added: 0, updated: 1, unchanged: 0, total: 1 })
  })

  it('propagates client errors without opening a transaction', async () => {
    const db = new FakeAreasDB()
    await expect(
      ingestAreas({ client: makeAreaClient(new Error('boom')), db }),
    ).rejects.toThrow('boom')
    expect(db.txOpened).toBe(0)
  })
})

// ============================================================
// FlavorTags
// ============================================================

class FakeFlavorTagsDB implements FlavorTagsDB {
  rows = new Map<number, { tag: FlavorTag; hash: string }>()
  upsertCalls = 0
  txOpened = 0
  txCompleted = 0

  async getExistingFlavorTagHashes(): Promise<Map<number, string>> {
    return new Map(Array.from(this.rows.entries()).map(([id, v]) => [id, v.hash]))
  }

  async upsertFlavorTagsBatch(
    rows: readonly FlavorTagUpsert[],
    onChunk?: (n: number) => void,
  ): Promise<void> {
    if (rows.length === 0) return
    for (const { tag, contentHash } of rows) {
      this.upsertCalls++
      this.rows.set(tag.tagId, { tag, hash: contentHash })
    }
    onChunk?.(rows.length)
  }

  async transaction<T>(fn: (tx: FlavorTagsDB) => Promise<T>): Promise<T> {
    this.txOpened++
    const result = await fn(this)
    this.txCompleted++
    return result
  }
}

const sTag = (overrides: Partial<SakenowaFlavorTag> = {}): SakenowaFlavorTag => ({
  id: 3,
  tag: '辛口',
  ...overrides,
})

const makeFlavorTagClient = (
  tags: SakenowaFlavorTag[] | Error,
): FlavorTagIngestionDeps['client'] => ({
  getFlavorTags: async () => {
    if (tags instanceof Error) throw tags
    return tags
  },
})

describe('sakenowaFlavorTagToFlavorTag', () => {
  it('maps Sakenowa `tag` field onto our `name` field', () => {
    expect(sakenowaFlavorTagToFlavorTag(sTag())).toEqual({
      tagId: 3,
      name: '辛口',
      source: 'sakenowa',
    })
  })
})

describe('computeFlavorChartContentHash', () => {
  const base: FlavorChart = {
    brandId: 2,
    f1: 0.27,
    f2: 0.51,
    f3: 0.31,
    f4: 0.42,
    f5: 0.46,
    f6: 0.42,
    source: 'sakenowa',
  }

  it('is deterministic across calls with identical input', () => {
    expect(computeFlavorChartContentHash(base)).toBe(computeFlavorChartContentHash(base))
  })

  it('changes when any canonical field changes', () => {
    const h0 = computeFlavorChartContentHash(base)
    expect(computeFlavorChartContentHash({ ...base, f1: 0.28 })).not.toBe(h0)
    expect(computeFlavorChartContentHash({ ...base, f6: 0.5 })).not.toBe(h0)
    expect(computeFlavorChartContentHash({ ...base, brandId: 3 })).not.toBe(h0)
    expect(computeFlavorChartContentHash({ ...base, source: 'manual_curation' })).not.toBe(h0)
    expect(computeFlavorChartContentHash({ ...base, confidence: 0.5 })).not.toBe(h0)
  })
})

describe('ingestFlavorCharts', () => {
  it('on an empty existing DB, classifies every chart as "added"', async () => {
    const db = new FakeFlavorChartsDB()
    const summary = await ingestFlavorCharts({
      client: makeFlavorChartClient([sChart({ brandId: 2 }), sChart({ brandId: 3 })]),
      db,
    })
    expect(summary).toEqual({ added: 2, updated: 0, unchanged: 0, total: 2 })
    expect(db.upsertCalls).toBe(2)
    expect(db.rows.size).toBe(2)
  })

  it('is idempotent — second run on identical source data writes zero rows', async () => {
    const db = new FakeFlavorChartsDB()
    const charts = [sChart({ brandId: 2 }), sChart({ brandId: 3, f1: 0.5 })]
    await ingestFlavorCharts({ client: makeFlavorChartClient(charts), db })
    db.upsertCalls = 0

    const summary = await ingestFlavorCharts({ client: makeFlavorChartClient(charts), db })

    expect(summary).toEqual({ added: 0, updated: 0, unchanged: 2, total: 2 })
    expect(db.upsertCalls).toBe(0)
  })

  it('classifies a Sakenowa-side axis mutation as "updated"', async () => {
    const db = new FakeFlavorChartsDB()
    await ingestFlavorCharts({ client: makeFlavorChartClient([sChart({ brandId: 2 })]), db })
    db.upsertCalls = 0

    const summary = await ingestFlavorCharts({
      client: makeFlavorChartClient([sChart({ brandId: 2, f1: 0.8 })]),
      db,
    })

    expect(summary).toEqual({ added: 0, updated: 1, unchanged: 0, total: 1 })
    expect(db.upsertCalls).toBe(1)
  })

  it('propagates client errors without opening a transaction', async () => {
    const db = new FakeFlavorChartsDB()
    const failure = new Error('Sakenowa offline')

    await expect(
      ingestFlavorCharts({ client: makeFlavorChartClient(failure), db }),
    ).rejects.toThrow('Sakenowa offline')

    expect(db.txOpened).toBe(0)
    expect(db.upsertCalls).toBe(0)
  })

  it('always runs inside a transaction', async () => {
    const db = new FakeFlavorChartsDB()
    await ingestFlavorCharts({ client: makeFlavorChartClient([sChart()]), db })
    expect(db.txOpened).toBe(1)
    expect(db.txCompleted).toBe(1)
  })

  it('wraps batch upsert errors with the count + PG detail', async () => {
    class FailingDB extends FakeFlavorChartsDB {
      override async upsertFlavorChartsBatch(): Promise<void> {
        const err = new Error('insert or update violates foreign key') as Error & {
          detail?: string
          constraint?: string
        }
        err.detail = 'Key (brand_id)=(99999) is not present in table "brands".'
        err.constraint = 'flavor_charts_brand_id_fkey'
        throw err
      }
    }
    const db = new FailingDB()

    const promise = ingestFlavorCharts({
      client: makeFlavorChartClient([sChart({ brandId: 99999 })]),
      db,
    })
    await expect(promise).rejects.toThrow(/Failed to upsert 1 flavor_chart row/)
    await expect(promise).rejects.toThrow(/constraint=flavor_charts_brand_id_fkey/)
  })

  it('invokes onProgress per write chunk with cumulative (rowsWritten, totalToWrite)', async () => {
    const db = new FakeFlavorChartsDB()
    const calls: Array<[number, number]> = []
    await ingestFlavorCharts({
      client: makeFlavorChartClient([
        sChart({ brandId: 1 }),
        sChart({ brandId: 2 }),
        sChart({ brandId: 3 }),
      ]),
      db,
      onProgress: (current, total) => calls.push([current, total]),
    })
    expect(calls).toEqual([[3, 3]])
  })
})

describe('computeFlavorTagContentHash', () => {
  const base: FlavorTag = { tagId: 3, name: '辛口', source: 'sakenowa' }

  it('is deterministic', () => {
    expect(computeFlavorTagContentHash(base)).toBe(computeFlavorTagContentHash(base))
  })

  it('changes when any canonical field changes', () => {
    const h0 = computeFlavorTagContentHash(base)
    expect(computeFlavorTagContentHash({ ...base, name: 'dry' })).not.toBe(h0)
  })
})

describe('ingestFlavorTags', () => {
  it('classifies new tags as "added" on an empty DB', async () => {
    const db = new FakeFlavorTagsDB()
    const summary = await ingestFlavorTags({
      client: makeFlavorTagClient([sTag({ id: 2, tag: '酸味' }), sTag({ id: 3 })]),
      db,
    })
    expect(summary).toEqual({ added: 2, updated: 0, unchanged: 0, total: 2 })
  })

  it('is idempotent', async () => {
    const db = new FakeFlavorTagsDB()
    const tags = [sTag({ id: 2, tag: '酸味' }), sTag({ id: 3 })]
    await ingestFlavorTags({ client: makeFlavorTagClient(tags), db })
    const summary = await ingestFlavorTags({ client: makeFlavorTagClient(tags), db })
    expect(summary).toEqual({ added: 0, updated: 0, unchanged: 2, total: 2 })
  })

  it('propagates client errors without opening a transaction', async () => {
    const db = new FakeFlavorTagsDB()
    await expect(
      ingestFlavorTags({ client: makeFlavorTagClient(new Error('boom')), db }),
    ).rejects.toThrow('boom')
    expect(db.txOpened).toBe(0)
  })
})

// ============================================================
// Rankings (ADR-0002 — wholesale replace)
// ============================================================

class FakeRankingsDB implements RankingsDB {
  rows: Ranking[] = []
  knownBrandIds = new Set<number>()
  replaceCalls = 0
  txOpened = 0
  txCompleted = 0

  async getKnownBrandIds(): Promise<Set<number>> {
    return new Set(this.knownBrandIds)
  }

  async replaceAll(rows: readonly Ranking[], onChunk?: (n: number) => void): Promise<void> {
    this.replaceCalls++
    this.rows = [...rows]
    if (rows.length > 0) onChunk?.(rows.length)
  }

  async transaction<T>(fn: (tx: RankingsDB) => Promise<T>): Promise<T> {
    this.txOpened++
    const result = await fn(this)
    this.txCompleted++
    return result
  }
}

const sRankings = (overrides: Partial<SakenowaRankingsPayload> = {}): SakenowaRankingsPayload => ({
  yearMonth: '202402',
  overall: [
    { rank: 1, brandId: 109, score: 4.4 },
    { rank: 2, brandId: 660, score: 4.1 },
  ],
  areas: [
    {
      areaId: 20,
      ranking: [{ rank: 1, brandId: 109, score: 4.4 }],
    },
  ],
  ...overrides,
})

const makeRankingsClient = (
  payload: SakenowaRankingsPayload | Error,
): RankingIngestionDeps['client'] => ({
  getRankings: async () => {
    if (payload instanceof Error) throw payload
    return payload
  },
})

describe('sakenowaRankingsToRankings', () => {
  it('flattens overall + per-area entries into a single Ranking[] with kind/areaId set', () => {
    const rows = sakenowaRankingsToRankings(sRankings())
    expect(rows).toEqual([
      { kind: 'overall', areaId: null, rank: 1, brandId: 109, score: 4.4, source: 'sakenowa' },
      { kind: 'overall', areaId: null, rank: 2, brandId: 660, score: 4.1, source: 'sakenowa' },
      { kind: 'area', areaId: 20, rank: 1, brandId: 109, score: 4.4, source: 'sakenowa' },
    ])
  })

  it("preserves areaId 0 as a valid area scope (foreign-producer rankings)", () => {
    const rows = sakenowaRankingsToRankings(
      sRankings({
        areas: [{ areaId: 0, ranking: [{ rank: 1, brandId: 40604, score: 4.4 }] }],
      }),
    )
    expect(rows.some((r) => r.kind === 'area' && r.areaId === 0 && r.brandId === 40604)).toBe(true)
  })
})

describe('ingestRankings', () => {
  it('returns total + dropped + yearMonth and writes via replaceAll', async () => {
    const db = new FakeRankingsDB()
    db.knownBrandIds = new Set([109, 660])
    const summary = await ingestRankings({ client: makeRankingsClient(sRankings()), db })
    expect(summary).toEqual({ total: 3, dropped: 0, yearMonth: '202402' })
    expect(db.replaceCalls).toBe(1)
    expect(db.rows).toHaveLength(3)
  })

  it('replaces previous snapshot on re-run (ADR-0002: latest-only, no idempotency-by-row)', async () => {
    const db = new FakeRankingsDB()
    db.knownBrandIds = new Set([109, 660, 5])
    await ingestRankings({ client: makeRankingsClient(sRankings()), db })
    const summary = await ingestRankings({
      client: makeRankingsClient(
        sRankings({
          yearMonth: '202403',
          overall: [{ rank: 1, brandId: 5, score: 5 }],
          areas: [],
        }),
      ),
      db,
    })
    expect(summary).toEqual({ total: 1, dropped: 0, yearMonth: '202403' })
    expect(db.replaceCalls).toBe(2)
    expect(db.rows).toEqual([
      { kind: 'overall', areaId: null, rank: 1, brandId: 5, score: 5, source: 'sakenowa' },
    ])
  })

  it('always runs inside a transaction', async () => {
    const db = new FakeRankingsDB()
    db.knownBrandIds = new Set([109, 660])
    await ingestRankings({ client: makeRankingsClient(sRankings()), db })
    expect(db.txOpened).toBe(1)
    expect(db.txCompleted).toBe(1)
  })

  it('propagates client errors without opening a transaction', async () => {
    const db = new FakeRankingsDB()
    await expect(
      ingestRankings({ client: makeRankingsClient(new Error('boom')), db }),
    ).rejects.toThrow('boom')
    expect(db.txOpened).toBe(0)
  })

  it('drops orphan ranking rows whose brand_id is not in brands; reports them in the summary', async () => {
    // Real Sakenowa data quirk: ~24 area-rankings per snapshot reference
    // brand_ids that have since been removed from /brands. The FK would
    // reject them, so the pipeline filters and surfaces the count.
    const db = new FakeRankingsDB()
    db.knownBrandIds = new Set([109]) // 660 + the area row's brand are orphans
    const summary = await ingestRankings({ client: makeRankingsClient(sRankings()), db })

    expect(summary).toEqual({ total: 2, dropped: 1, yearMonth: '202402' })
    // 660 in the overall list is kept (its brandId is 660, not in known) — wait,
    // re-read: known = {109}. So overall row brandId=660 is orphan, dropped.
    // overall row brandId=109 kept. area row brandId=109 kept. Total kept = 2.
    expect(db.rows.map((r) => r.brandId).sort()).toEqual([109, 109])
  })

  it('drops every row when no brands are known yet (defensive — empty DB)', async () => {
    const db = new FakeRankingsDB() // knownBrandIds defaults to empty set
    const summary = await ingestRankings({ client: makeRankingsClient(sRankings()), db })

    expect(summary).toEqual({ total: 0, dropped: 3, yearMonth: '202402' })
    expect(db.rows).toHaveLength(0)
    // TRUNCATE still happens (replaceAll is called with []), which is
    // intentional: an empty rankings table after a known-brand-set wipe
    // is a more honest signal than stale rankings against missing brands.
    expect(db.replaceCalls).toBe(1)
  })
})

// ============================================================
// Source revision hash
// ============================================================

describe('computeSourceRevisionHash', () => {
  const inputs = {
    areas: [{ id: 1, name: '北海道' }],
    brands: [{ id: 1, name: '麗人', breweryId: 49 }],
    breweries: [{ id: 49, name: '麗人酒造', areaId: 20 }],
    flavorTags: [{ id: 3, tag: '辛口' }],
    rankings: {
      yearMonth: '202402',
      overall: [{ rank: 1, brandId: 109, score: 4.4 }],
      areas: [],
    },
  } satisfies Parameters<typeof computeSourceRevisionHash>[0]

  it('is deterministic across calls with identical input', () => {
    expect(computeSourceRevisionHash(inputs)).toBe(computeSourceRevisionHash(inputs))
  })

  it('is invariant to key insertion order on the inputs object', () => {
    const reordered = {
      rankings: inputs.rankings,
      flavorTags: inputs.flavorTags,
      breweries: inputs.breweries,
      brands: inputs.brands,
      areas: inputs.areas,
    }
    expect(computeSourceRevisionHash(reordered)).toBe(computeSourceRevisionHash(inputs))
  })

  it('changes when any input scope mutates', () => {
    const h0 = computeSourceRevisionHash(inputs)
    expect(
      computeSourceRevisionHash({
        ...inputs,
        brands: [{ id: 1, name: '改名', breweryId: 49 }],
      }),
    ).not.toBe(h0)
    expect(
      computeSourceRevisionHash({
        ...inputs,
        rankings: { ...inputs.rankings, yearMonth: '202403' },
      }),
    ).not.toBe(h0)
  })

  it('distinguishes "scope not fetched" from "scope fetched and empty"', () => {
    // Forward-looking: #54 cron can decide "Sakenowa changed" only if a
    // partial fetch hashes differently than an absent scope. null != [].
    const noBrands = { ...inputs, brands: undefined }
    const emptyBrands = { ...inputs, brands: [] }
    expect(computeSourceRevisionHash(noBrands)).not.toBe(computeSourceRevisionHash(emptyBrands))
  })
})

// ============================================================
// IngestionRuns
// ============================================================

class FakeIngestionRunsDB implements IngestionRunsDB {
  rows: IngestionRunInsert[] = []
  async insertRun(run: IngestionRunInsert): Promise<void> {
    this.rows.push(run)
  }
}

describe('recordIngestionRun', () => {
  it('persists a single row via insertRun', async () => {
    const db = new FakeIngestionRunsDB()
    const run: IngestionRunInsert = {
      startedAt: new Date('2026-05-29T10:00:00.000Z'),
      finishedAt: new Date('2026-05-29T10:00:45.000Z'),
      status: 'success',
      perTable: { brands: { added: 12, updated: 3, unchanged: 3000, total: 3015 } },
      sourceRevisionHash: 'a'.repeat(64),
      errorMessage: null,
    }
    await recordIngestionRun(db, run)
    expect(db.rows).toEqual([run])
  })

  it('passes through a failed run with errorMessage', async () => {
    const db = new FakeIngestionRunsDB()
    await recordIngestionRun(db, {
      startedAt: new Date('2026-05-29T10:00:00.000Z'),
      finishedAt: new Date('2026-05-29T10:00:01.000Z'),
      status: 'failed',
      perTable: {},
      sourceRevisionHash: 'partial-' + 'b'.repeat(56),
      errorMessage: 'Sakenowa /brands returned 500',
    })
    expect(db.rows[0]).toMatchObject({ status: 'failed', errorMessage: 'Sakenowa /brands returned 500' })
  })
})
