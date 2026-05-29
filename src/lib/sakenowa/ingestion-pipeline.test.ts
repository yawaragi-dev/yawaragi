import { describe, expect, it } from 'vitest'
import {
  computeBreweryContentHash,
  computeContentHash,
  ingestBrands,
  ingestBreweries,
  sakenowaBrandToBrand,
  sakenowaBreweryToBrewery,
  type BreweryIngestionDeps,
  type IngestionDeps,
} from './ingestion-pipeline'
import type { Brand } from '../schemas/brand'
import type { Brewery } from '../schemas/brewery'
import type { SakenowaBrand, SakenowaBrewery } from './client'
import type { BrandsDB, BreweriesDB } from './db'

class FakeBrandsDB implements BrandsDB {
  rows = new Map<number, { brand: Brand; hash: string }>()
  upsertCalls = 0
  txOpened = 0
  txCompleted = 0

  async getExistingBrandHashes(): Promise<Map<number, string>> {
    return new Map(Array.from(this.rows.entries()).map(([id, v]) => [id, v.hash]))
  }

  async upsertBrand(brand: Brand, hash: string): Promise<void> {
    this.upsertCalls++
    this.rows.set(brand.brandId, { brand, hash })
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

  it('invokes onProgress with (current, total) for every row, 1-indexed', async () => {
    const db = new FakeBrandsDB()
    const calls: Array<[number, number]> = []
    await ingestBrands({
      client: makeClient([sBrand({ id: 1 }), sBrand({ id: 2, name: '十四代' }), sBrand({ id: 3, name: '獺祭' })]),
      db,
      onProgress: (current, total) => calls.push([current, total]),
    })
    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })
})

class FakeBreweriesDB implements BreweriesDB {
  rows = new Map<number, { brewery: Brewery; hash: string }>()
  upsertCalls = 0
  txOpened = 0
  txCompleted = 0

  async getExistingBreweryHashes(): Promise<Map<number, string>> {
    return new Map(Array.from(this.rows.entries()).map(([id, v]) => [id, v.hash]))
  }

  async upsertBrewery(brewery: Brewery, hash: string): Promise<void> {
    this.upsertCalls++
    this.rows.set(brewery.breweryId, { brewery, hash })
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

  it('invokes onProgress with (current, total) for every row, 1-indexed', async () => {
    const db = new FakeBreweriesDB()
    const calls: Array<[number, number]> = []
    await ingestBreweries({
      client: makeBreweryClient([sBrewery({ id: 1 }), sBrewery({ id: 2 }), sBrewery({ id: 3 })]),
      db,
      onProgress: (current, total) => calls.push([current, total]),
    })
    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })
})
