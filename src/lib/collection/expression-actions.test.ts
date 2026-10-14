import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Brand } from '@/lib/schemas/brand'

const h = vi.hoisted(() => ({
  journal: null as unknown,
  cellar: null as unknown,
  expressions: null as unknown,
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_admin' })) }))
vi.mock('@/lib/auth/maintainer', () => ({ currentUserIsMaintainer: vi.fn(async () => true) }))
vi.mock('@/lib/sakenowa/lookup', () => ({ lookupBrand: vi.fn() }))
vi.mock('@/lib/taste/get-journal-store', () => ({ getJournalStore: vi.fn(() => h.journal) }))
vi.mock('@/lib/collection/get-cellar-store', () => ({ getCellarStore: vi.fn(() => h.cellar) }))
vi.mock('@/lib/collection/get-expression-store', () => ({
  getExpressionStore: vi.fn(() => h.expressions),
}))

import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import {
  addOwnBottling,
  deleteOwnBottling,
  renameOwnBottling,
  restoreOwnBottling,
} from '@/lib/collection/expression-actions'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { InMemoryExpressionStore } from '@/lib/collection/in-memory-expression-store'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'

const RIHAKU: Brand = {
  brandId: 12,
  name: '李白',
  nameKanji: '李白',
  nameRomaji: 'Rihaku',
  breweryId: 3,
  source: 'sakenowa',
}
const USER = 'user_admin'
const store = () => h.expressions as InMemoryExpressionStore
const journal = () => h.journal as InMemoryJournalStore
const cellar = () => h.cellar as InMemoryCellarStore

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }

/** A bottling of Rihaku with one tasting and one bottle, beside the sake's own two bottles. */
async function seedBottlingOfASake(): Promise<string> {
  const added = await addOwnBottling({ brandId: 12, name: 'Harvest Moon' })
  if (added.status !== 'ok') throw new Error(added.status)
  const id = added.expressionId
  await journal().put(USER, {
    schemaVersion: 3,
    id: 't1',
    event: { kind: 'rating', rating: 4, brandId: 12, target: TARGET, occurredAt: 10 },
    sake: { nameKanji: '李白', nameRomaji: 'Rihaku' },
    expression: { id, name: 'Harvest Moon' },
    triedAt: 10,
    createdAt: 10,
  })
  const row = {
    schemaVersion: 3,
    brandId: 12,
    sake: { nameKanji: '李白', nameRomaji: 'Rihaku' },
    sizeMl: null,
    nama: false,
    openedAt: null,
    addedAt: 5,
    updatedAt: 5,
  } as const
  await cellar().put(USER, { ...row, count: 2 })
  await cellar().put(USER, { ...row, count: 1, expression: { id, name: 'Harvest Moon' } })
  return id
}

beforeEach(() => {
  vi.clearAllMocks()
  h.journal = new InMemoryJournalStore()
  h.cellar = new InMemoryCellarStore()
  h.expressions = new InMemoryExpressionStore()
  vi.mocked(currentUserIsMaintainer).mockResolvedValue(true)
  vi.mocked(lookupBrand).mockResolvedValue(RIHAKU)
})

describe('adding your own bottling of a sake', () => {
  it('keeps the name as typed, under the sake it belongs to', async () => {
    const result = await addOwnBottling({ brandId: 12, name: '  Rihaku Wandering Poet ' })
    expect(result.status).toBe('ok')

    const [bottling] = await store().read(USER)
    expect(bottling).toMatchObject({
      id: result.status === 'ok' ? result.expressionId : '',
      own: true,
      brandId: 12,
      line: { nameKanji: '李白', nameRomaji: 'Rihaku' },
      name: 'Rihaku Wandering Poet',
    })
    expect(bottling!.brewery).toBeUndefined()
  })

  it('gives back the bottling already there when the same name is added twice', async () => {
    const first = await addOwnBottling({ brandId: 12, name: 'Wandering Poet' })
    const second = await addOwnBottling({ brandId: 12, name: 'wandering poet ' })
    expect(second).toEqual(first)
    expect(await store().read(USER)).toHaveLength(1)
  })

  it('keeps bottlings of the same name apart when they belong to different sakes', async () => {
    await addOwnBottling({ brandId: 12, name: 'Nama' })
    vi.mocked(lookupBrand).mockResolvedValue({ ...RIHAKU, brandId: 13, nameKanji: '而今' })
    await addOwnBottling({ brandId: 13, name: 'Nama' })
    // Added in the same millisecond, so their order is not the point.
    expect((await store().read(USER)).map((e) => e.brandId).sort()).toEqual([12, 13])
  })

  it('refuses an empty or overlong name, and a sake not in the catalogue', async () => {
    expect(await addOwnBottling({ brandId: 12, name: '   ' })).toEqual({ status: 'invalid_input' })
    expect(await addOwnBottling({ brandId: 12, name: 'x'.repeat(121) })).toEqual({
      status: 'invalid_input',
    })
    vi.mocked(lookupBrand).mockResolvedValue(null)
    expect(await addOwnBottling({ brandId: 999, name: 'Nama' })).toEqual({ status: 'not_found' })
    expect(await store().read(USER)).toEqual([])
  })

  it('keeps a bottle the catalogue does not know, with the brewery as read off the label', async () => {
    const result = await addOwnBottling({ brandId: null, name: '富久千代', brewery: ' 盛田屋 ' })
    expect(result.status).toBe('ok')
    expect(lookupBrand).not.toHaveBeenCalled()

    const [bottling] = await store().read(USER)
    expect(bottling).toMatchObject({ own: true, brandId: null, line: null, name: '富久千代', brewery: '盛田屋' })
  })

  it('needs only the name: a blank brewery is left out', async () => {
    await addOwnBottling({ brandId: null, name: '富久千代', brewery: '   ' })
    const [bottling] = await store().read(USER)
    expect(bottling!.brewery).toBeUndefined()
  })

  it('tells two bottles of the same name apart by their brewery', async () => {
    const first = await addOwnBottling({ brandId: null, name: '旭', brewery: '甲酒造' })
    const again = await addOwnBottling({ brandId: null, name: '旭', brewery: '甲酒造' })
    const other = await addOwnBottling({ brandId: null, name: '旭', brewery: '乙酒造' })
    expect(again).toEqual(first)
    expect(other).not.toEqual(first)
    expect(await store().read(USER)).toHaveLength(2)
  })

  it('stores nothing for someone who is not a maintainer', async () => {
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    expect(await addOwnBottling({ brandId: 12, name: 'Nama' })).toEqual({ status: 'forbidden' })
    expect(await store().read(USER)).toEqual([])
  })
})

describe('renaming a bottling you added', () => {
  it('changes the name everywhere it is printed', async () => {
    const id = await seedBottlingOfASake()
    expect(await renameOwnBottling({ expressionId: id, name: ' Wandering Poet ' })).toEqual({ status: 'ok' })

    expect((await store().read(USER))[0]!.name).toBe('Wandering Poet')
    expect((await journal().read(USER))[0]!.expression).toEqual({ id, name: 'Wandering Poet' })
    expect((await cellar().read(USER)).find((r) => r.expression)!.expression!.name).toBe('Wandering Poet')
  })

  it('lets the brewery of a bottle with no sake be set, changed and cleared', async () => {
    const added = await addOwnBottling({ brandId: null, name: '富久千代' })
    const id = added.status === 'ok' ? added.expressionId : ''
    await renameOwnBottling({ expressionId: id, name: '富久千代', brewery: '盛田屋' })
    expect((await store().read(USER))[0]!.brewery).toBe('盛田屋')
    await renameOwnBottling({ expressionId: id, name: '富久千代', brewery: '' })
    expect((await store().read(USER))[0]!.brewery).toBeUndefined()
  })

  it('stops calling a name an AI reading once the visitor has written their own', async () => {
    const added = await addOwnBottling({
      brandId: null,
      name: 'Kyōgoku (京極)',
      brewery: 'Niseko Shuzō (二世古酒造)',
      aiName: true,
      aiBrewery: true,
    })
    const id = added.status === 'ok' ? added.expressionId : ''
    expect((await store().read(USER))[0]).toMatchObject({ aiName: true, aiBrewery: true })

    // Renamed, the brewery kept as it was: only the name is theirs now.
    await renameOwnBottling({ expressionId: id, name: 'Kyogoku Honjozo', brewery: 'Niseko Shuzō (二世古酒造)' })
    const renamed = (await store().read(USER))[0]!
    expect(renamed.aiName).toBeUndefined()
    expect(renamed.aiBrewery).toBe(true)

    await renameOwnBottling({ expressionId: id, name: 'Kyogoku Honjozo', brewery: 'Niseko' })
    expect((await store().read(USER))[0]!.aiBrewery).toBeUndefined()
  })

  it('keeps the grade, styles and polishing a bottling was added with, and a rename can change or clear them', async () => {
    const added = await addOwnBottling({
      brandId: 12,
      name: 'Rihaku Omachi (雄町) Junmai Ginjō',
      details: { grade: 'junmai_ginjo', styles: ['Nama', ' ', 'Genshu'], polishingPct: 50 },
    })
    const id = added.status === 'ok' ? added.expressionId : ''
    expect((await store().read(USER))[0]).toMatchObject({
      grade: 'junmai_ginjo',
      styles: ['Nama', 'Genshu'],
      polishingPct: 50,
    })

    await renameOwnBottling({ expressionId: id, name: 'Rihaku Omachi', details: { grade: 'junmai' } })
    const renamed = (await store().read(USER))[0]!
    expect(renamed.grade).toBe('junmai')
    expect(renamed.styles).toBeUndefined()
    expect(renamed.polishingPct).toBeUndefined()

    // A rename that does not mention them leaves them as they were.
    await renameOwnBottling({ expressionId: id, name: 'Rihaku Omachi Junmai' })
    expect((await store().read(USER))[0]!.grade).toBe('junmai')
  })

  it('leaves the brewery of a bottling of a sake to the catalogue', async () => {
    const id = await seedBottlingOfASake()
    expect(await renameOwnBottling({ expressionId: id, name: 'Poet', brewery: '李白酒造' })).toEqual({ status: 'ok' })
    expect((await store().read(USER))[0]!.brewery).toBeUndefined()
  })

  it('refuses an empty name and a bottling that is not yours', async () => {
    const id = await seedBottlingOfASake()
    expect(await renameOwnBottling({ expressionId: id, name: '  ' })).toEqual({ status: 'invalid_input' })
    expect(await renameOwnBottling({ expressionId: 'nope', name: 'Poet' })).toEqual({ status: 'not_found' })
  })
})

describe('deleting a bottling you added', () => {
  it('of a sake: the bottling goes, its tasting and bottle stay under the sake', async () => {
    const id = await seedBottlingOfASake()
    const result = await deleteOwnBottling(id)
    expect(result.status).toBe('ok')

    expect(await store().read(USER)).toEqual([])
    const [tasting] = await journal().read(USER)
    expect(tasting!.expression).toBeUndefined()
    expect(tasting!.event).toMatchObject({ brandId: 12, rating: 4 })
    // 2 of the sake + 1 of the bottling, on the sake's one row.
    expect((await cellar().read(USER)).map((r) => [r.expression, r.count])).toEqual([[undefined, 3]])
  })

  it('with no sake: its tastings and bottles go with it', async () => {
    const added = await addOwnBottling({ brandId: null, name: '富久千代' })
    const id = added.status === 'ok' ? added.expressionId : ''
    await journal().put(USER, {
      schemaVersion: 3,
      id: 't9',
      event: { kind: 'rating', rating: 4, brandId: null, target: null, occurredAt: 10 },
      sake: { nameKanji: '富久千代', nameRomaji: null },
      expression: { id, name: '富久千代' },
      triedAt: 10,
      createdAt: 10,
    })
    expect((await deleteOwnBottling(id)).status).toBe('ok')
    expect(await store().read(USER)).toEqual([])
    expect(await journal().read(USER)).toEqual([])
  })

  it('Undo puts the bottling, its tasting and both cellar rows back exactly as they were', async () => {
    const id = await seedBottlingOfASake()
    const before = {
      expressions: await store().read(USER),
      journal: await journal().read(USER),
      cellar: (await cellar().read(USER)).sort((a, b) => a.count - b.count),
    }

    const deleted = await deleteOwnBottling(id)
    if (deleted.status !== 'ok') throw new Error(deleted.status)
    // The undo crosses to the browser and back, as plain JSON.
    const undo = JSON.parse(JSON.stringify(deleted.undo))
    expect(await restoreOwnBottling(undo)).toEqual({ status: 'ok' })

    expect(await store().read(USER)).toEqual(before.expressions)
    expect(await journal().read(USER)).toEqual(before.journal)
    expect((await cellar().read(USER)).sort((a, b) => a.count - b.count)).toEqual(before.cellar)
  })

  it('of a bottling whose bottle was opened before rows had sizes: nothing is left behind', async () => {
    const added = await addOwnBottling({ brandId: 12, name: 'Harvest Moon' })
    const id = added.status === 'ok' ? added.expressionId : ''
    // As v2 stored it: the open bottle on the row keyed by the bottling alone.
    cellar().putRaw(
      USER,
      `x:${id}`,
      JSON.stringify({
        schemaVersion: 2,
        brandId: 12,
        expression: { id, name: 'Harvest Moon' },
        sake: { nameKanji: '李白', nameRomaji: 'Rihaku' },
        count: 1,
        openedAt: 5000,
        addedAt: 5,
        updatedAt: 5,
      }),
    )

    expect((await deleteOwnBottling(id)).status).toBe('ok')
    const rows = await cellar().read(USER)
    // One row, the sake's, holding the open bottle — and no row of the bottling's.
    expect(rows.map((r) => [r.expression, r.count, r.openedAt])).toEqual([[undefined, 1, 5000]])
    expect((await cellar().dump(USER)).rejected).toEqual([])
  })

  it('Undo takes away a cellar row the delete had to create', async () => {
    const added = await addOwnBottling({ brandId: 12, name: 'Harvest Moon' })
    const id = added.status === 'ok' ? added.expressionId : ''
    await cellar().put(USER, {
      schemaVersion: 3,
      brandId: 12,
      expression: { id, name: 'Harvest Moon' },
      sake: { nameKanji: '李白', nameRomaji: 'Rihaku' },
      count: 1,
      sizeMl: null,
      nama: false,
      openedAt: null,
      addedAt: 5,
      updatedAt: 5,
    })
    const deleted = await deleteOwnBottling(id)
    if (deleted.status !== 'ok') throw new Error(deleted.status)
    expect((await cellar().read(USER)).map((r) => r.expression)).toEqual([undefined])

    await restoreOwnBottling(JSON.parse(JSON.stringify(deleted.undo)))
    expect((await cellar().read(USER)).map((r) => r.expression?.name)).toEqual(['Harvest Moon'])
  })

  it('an Undo cannot be used to write records that are not the bottling\'s own', async () => {
    const id = await seedBottlingOfASake()
    const deleted = await deleteOwnBottling(id)
    if (deleted.status !== 'ok') throw new Error(deleted.status)
    const undo = JSON.parse(JSON.stringify(deleted.undo))

    // A tasting of something else, smuggled in.
    const foreignEntry = { ...undo, entries: [{ ...undo.entries[0], id: 'evil', expression: { id: 'other', name: 'x' } }] }
    expect(await restoreOwnBottling(foreignEntry)).toEqual({ status: 'invalid_input' })
    // A cellar row of another sake.
    const foreignRow = { ...undo, cellar: [{ ...undo.cellar[0], expression: undefined, brandId: 99 }] }
    expect(await restoreOwnBottling(foreignRow)).toEqual({ status: 'invalid_input' })
    // A row key to delete that is not the sake's.
    expect(await restoreOwnBottling({ ...undo, createdCellarKeys: ['77'] })).toEqual({ status: 'invalid_input' })

    expect(await store().read(USER)).toEqual([])
  })

  it('does nothing for a bottling that is not yours, or for someone who is not a maintainer', async () => {
    expect(await deleteOwnBottling('nope')).toEqual({ status: 'not_found' })
    const id = await seedBottlingOfASake()
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    expect(await deleteOwnBottling(id)).toEqual({ status: 'forbidden' })
    expect(await renameOwnBottling({ expressionId: id, name: 'Poet' })).toEqual({ status: 'forbidden' })
  })
})
