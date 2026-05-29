import { describe, expect, it } from 'vitest'
import {
  computeContentHash,
  ingestBrands,
  sakenowaBrandToBrand,
  type IngestionDeps,
} from './ingestion-pipeline'
import type { Brand } from '../schemas/brand'
import type { SakenowaBrand } from './client'
import type { BrandsDB } from './db'

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
