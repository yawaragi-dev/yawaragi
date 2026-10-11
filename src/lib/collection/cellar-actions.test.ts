import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  addToCellar,
  finishCellarBottle,
  openCellarBottle,
  removeFromCellar,
} from '@/lib/collection/cellar-actions'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { InMemoryExpressionStore } from '@/lib/collection/in-memory-expression-store'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'

const USER = 'user_admin'
const cellar = () => h.cellar as InMemoryCellarStore

beforeEach(() => {
  vi.clearAllMocks()
  h.journal = new InMemoryJournalStore()
  h.cellar = new InMemoryCellarStore()
  h.expressions = new InMemoryExpressionStore()
  vi.mocked(currentUserIsMaintainer).mockResolvedValue(true)
  vi.mocked(lookupBrand).mockResolvedValue({
    brandId: 7,
    name: 'Jikon',
    nameKanji: '而今',
    nameRomaji: 'Jikon',
    breweryId: 1,
    source: 'sakenowa',
  })
})

describe('the cellar, from the buttons', () => {
  it('adds a bottle with its name, then another to the same row', async () => {
    expect(await addToCellar({ brandId: 7 })).toEqual({ status: 'ok', count: 1 })
    expect(await addToCellar({ brandId: 7 })).toEqual({ status: 'ok', count: 2 })
    const rows = await cellar().read(USER)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sake: { nameKanji: '而今' }, count: 2, openedAt: null })
  })

  it('opens, finishes one of two, and finishing the last takes the row', async () => {
    await addToCellar({ brandId: 7 })
    await addToCellar({ brandId: 7 })
    await openCellarBottle({ brandId: 7 })
    expect((await cellar().read(USER))[0]!.openedAt).toBeTypeOf('number')

    expect(await finishCellarBottle({ brandId: 7 })).toEqual({ status: 'ok', count: 1 })
    expect((await cellar().read(USER))[0]!.openedAt).toBeNull()
    expect(await finishCellarBottle({ brandId: 7 })).toEqual({ status: 'ok', count: 0 })
    expect(await cellar().read(USER)).toEqual([])
  })

  it('removes one bottle at a time, and the row with the last one', async () => {
    await addToCellar({ brandId: 7 })
    await addToCellar({ brandId: 7 })
    expect(await removeFromCellar({ brandId: 7 })).toEqual({ status: 'ok', count: 1 })
    expect((await cellar().read(USER))[0]!.count).toBe(1)
    expect(await removeFromCellar({ brandId: 7 })).toEqual({ status: 'ok', count: 0 })
    expect(await cellar().read(USER)).toEqual([])
  })

  it('refuses a sake not in the catalogue, a row that is not there, and a non-maintainer', async () => {
    vi.mocked(lookupBrand).mockResolvedValue(null)
    expect(await addToCellar({ brandId: 9 })).toEqual({ status: 'not_found' })
    expect(await openCellarBottle({ brandId: 9 })).toEqual({ status: 'not_found' })
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    expect(await addToCellar({ brandId: 7 })).toEqual({ status: 'forbidden' })
  })

  describe('bottles of a bottling you added', () => {
    const expressions = () => h.expressions as InMemoryExpressionStore
    const bottling = {
      schemaVersion: 1,
      id: 'x1',
      own: true,
      brandId: 7,
      line: { nameKanji: '而今', nameRomaji: 'Jikon' },
      name: 'Jikon Nama 2025',
      createdAt: 1,
      updatedAt: 1,
    } as const

    it('get a row of their own, apart from the sake\'s', async () => {
      await expressions().put(USER, bottling)
      await addToCellar({ brandId: 7 })
      await addToCellar({ brandId: 7 })
      expect(await addToCellar({ expressionId: 'x1' })).toEqual({ status: 'ok', count: 1 })

      const rows = await cellar().read(USER)
      expect(
        Object.fromEntries(rows.map((r) => [r.expression?.name ?? r.sake.nameRomaji, r.count])),
      ).toEqual({ Jikon: 2, 'Jikon Nama 2025': 1 })
      // The bottling's row still knows its sake, so the sake's page can count it.
      expect(rows.find((r) => r.expression)).toMatchObject({ brandId: 7, sake: { nameKanji: '而今' } })
    })

    it('open and finish on their own row, leaving the sake\'s bottles alone', async () => {
      await expressions().put(USER, bottling)
      await addToCellar({ brandId: 7 })
      await addToCellar({ expressionId: 'x1' })

      await openCellarBottle({ expressionId: 'x1' })
      let rows = await cellar().read(USER)
      expect(rows.find((r) => r.expression)!.openedAt).not.toBeNull()
      expect(rows.find((r) => !r.expression)!.openedAt).toBeNull()

      expect(await finishCellarBottle({ expressionId: 'x1' })).toEqual({ status: 'ok', count: 0 })
      rows = await cellar().read(USER)
      expect(rows.map((r) => r.expression?.id ?? 'sake')).toEqual(['sake'])
    })

    it('can be kept for a bottle whose sake the catalogue lacks', async () => {
      await expressions().put(USER, {
        ...bottling,
        id: 'x2',
        brandId: null,
        line: null,
        name: '富久千代',
      })
      expect(await addToCellar({ expressionId: 'x2' })).toEqual({ status: 'ok', count: 1 })
      expect(lookupBrand).not.toHaveBeenCalled()
      expect((await cellar().read(USER))[0]).toMatchObject({
        brandId: null,
        expression: { id: 'x2', name: '富久千代' },
        sake: { nameKanji: '富久千代', nameRomaji: null },
      })
    })

    it('cannot be added for a bottling that is not yours', async () => {
      expect(await addToCellar({ expressionId: 'nope' })).toEqual({ status: 'not_found' })
      expect(await cellar().read(USER)).toEqual([])
    })

    it('refuses a target that is neither a sake nor a bottling, or both', async () => {
      // @ts-expect-error — not a target
      expect(await addToCellar({})).toEqual({ status: 'invalid_input' })
      // Both at once: the type allows it structurally, the schema does not.
      expect(await addToCellar({ brandId: 7, expressionId: 'x1' })).toEqual({ status: 'invalid_input' })
    })
  })
})
