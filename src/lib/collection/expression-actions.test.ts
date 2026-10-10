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
import { addOwnBottling } from '@/lib/collection/expression-actions'
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
