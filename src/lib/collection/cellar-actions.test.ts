import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  journal: null as unknown,
  cellar: null as unknown,
  expressions: null as unknown,
  history: null as unknown,
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_admin' })) }))
vi.mock('@/lib/auth/maintainer', () => ({ currentUserIsMaintainer: vi.fn(async () => true) }))
vi.mock('@/lib/sakenowa/catalogue-reads', () => ({ lookupBrand: vi.fn() }))
vi.mock('@/lib/taste/get-journal-store', () => ({ getJournalStore: vi.fn(() => h.journal) }))
vi.mock('@/lib/collection/get-cellar-store', () => ({ getCellarStore: vi.fn(() => h.cellar) }))
vi.mock('@/lib/collection/get-expression-store', () => ({
  getExpressionStore: vi.fn(() => h.expressions),
}))
vi.mock('@/lib/collection/get-bottle-history-store', () => ({
  getBottleHistoryStore: vi.fn(() => h.history),
}))

import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import {
  addToCellar,
  editCellarRow,
  finishCellarBottle,
  openCellarBottle,
  removeFromCellar,
} from '@/lib/collection/cellar-actions'
import { InMemoryBottleHistoryStore } from '@/lib/collection/in-memory-bottle-history-store'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { InMemoryExpressionStore } from '@/lib/collection/in-memory-expression-store'
import { cellarRowKey } from '@/lib/schemas/cellar-bottle'
import { lookupBrand } from '@/lib/sakenowa/catalogue-reads'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'

const USER = 'user_admin'
const cellar = () => h.cellar as InMemoryCellarStore
const expressions = () => h.expressions as InMemoryExpressionStore
const history = () => h.history as InMemoryBottleHistoryStore
/** The history as [kind, count, size] lines, oldest first. */
const ledger = async () =>
  (await history().read(USER)).map((e) => [e.kind, e.count, e.sizeMl, e.seeded ?? false])
const ONE = { count: 1, sizeMl: 720, nama: false } as const
/** The cellar as [key, count] pairs. */
const shelf = async () =>
  Object.fromEntries((await cellar().read(USER)).map((r) => [cellarRowKey(r), r.count]))

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

beforeEach(() => {
  vi.clearAllMocks()
  h.journal = new InMemoryJournalStore()
  h.cellar = new InMemoryCellarStore()
  h.expressions = new InMemoryExpressionStore()
  h.history = new InMemoryBottleHistoryStore()
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

describe('the cellar, from the sheet and the row buttons', () => {
  it('adds the bottles the sheet asked for, with their size and kind, and counts them', async () => {
    expect(await addToCellar({ brandId: 7 }, { count: 2, sizeMl: 1800, nama: true })).toEqual({
      status: 'ok',
      count: 2,
    })
    const [row] = await cellar().read(USER)
    expect(row).toMatchObject({
      sake: { nameKanji: '而今' },
      sizeMl: 1800,
      nama: true,
      count: 2,
      openedAt: null,
    })
  })

  it('keeps the same sake in two sizes on two rows, and counts both', async () => {
    await addToCellar({ brandId: 7 }, ONE)
    const second = await addToCellar({ brandId: 7 }, { count: 1, sizeMl: 1800, nama: false })
    expect(second).toEqual({ status: 'ok', count: 2 })
    expect(await shelf()).toEqual({ '7|720|s': 1, '7|1800|s': 1 })
    // The name is taken from the row already there: one catalogue lookup, not two.
    expect(lookupBrand).toHaveBeenCalledTimes(1)
  })

  it('opens a bottle onto its own row, finishes it, and leaves the sealed ones', async () => {
    await addToCellar({ brandId: 7 }, { ...ONE, count: 2 })
    expect(await openCellarBottle('7|720|s')).toEqual({ status: 'ok', count: 2 })
    expect(await shelf()).toEqual({ '7|720|s': 1, '7|720|s|open': 1 })

    // Another bottle bought while one is open waits sealed beside it.
    await addToCellar({ brandId: 7 }, ONE)
    expect(await shelf()).toEqual({ '7|720|s': 2, '7|720|s|open': 1 })

    expect(await finishCellarBottle('7|720|s|open')).toEqual({ status: 'ok', count: 2 })
    expect(await shelf()).toEqual({ '7|720|s': 2 })
  })

  it('removes one sealed bottle at a time; the last one takes the row', async () => {
    await addToCellar({ brandId: 7 }, { ...ONE, count: 2 })
    expect(await removeFromCellar('7|720|s')).toEqual({ status: 'ok', count: 1 })
    expect(await removeFromCellar('7|720|s')).toEqual({ status: 'ok', count: 0 })
    expect(await shelf()).toEqual({})
  })

  it('edits a row from the sheet: a new size moves it, a new count stays put', async () => {
    await addToCellar({ brandId: 7 }, ONE)
    expect(await editCellarRow('7|720|s', { count: 3, sizeMl: 720, nama: false })).toEqual({
      status: 'ok',
      count: 3,
    })
    await editCellarRow('7|720|s', { count: 3, sizeMl: 300, nama: true })
    expect(await shelf()).toEqual({ '7|300|n': 3 })
  })

  it('moves an open bottle from before the sheet onto its own row the first time anything is done', async () => {
    // As v2 stored it: three bottles, one open, all on the row keyed by the brand.
    cellar().putRaw(
      USER,
      '7',
      JSON.stringify({
        schemaVersion: 2,
        brandId: 7,
        sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
        count: 3,
        openedAt: 5000,
        addedAt: 1,
        updatedAt: 1,
      }),
    )
    expect(await finishCellarBottle('7|open')).toEqual({ status: 'ok', count: 2 })
    expect(await shelf()).toEqual({ '7': 2 })
  })

  it('says not found for a row that is not there, and for a sake not in the catalogue', async () => {
    expect(await openCellarBottle('7|720|s')).toEqual({ status: 'not_found' })
    vi.mocked(lookupBrand).mockResolvedValue(null)
    expect(await addToCellar({ brandId: 999 }, ONE)).toEqual({ status: 'not_found' })
  })

  it('refuses what the sheet could not have sent', async () => {
    // @ts-expect-error — not a size the sheet offers
    expect(await addToCellar({ brandId: 7 }, { count: 1, sizeMl: 500, nama: false })).toEqual({
      status: 'invalid_input',
    })
    expect(await addToCellar({ brandId: 7 }, { count: 0, sizeMl: 720, nama: false })).toEqual({
      status: 'invalid_input',
    })
    // @ts-expect-error — not a target
    expect(await addToCellar({}, ONE)).toEqual({ status: 'invalid_input' })
    expect(await removeFromCellar('')).toEqual({ status: 'invalid_input' })
  })

  it('stores nothing for someone who is not a maintainer', async () => {
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    expect(await addToCellar({ brandId: 7 }, ONE)).toEqual({ status: 'forbidden' })
    expect(await cellar().read(USER)).toEqual([])
  })

  describe('bottles of a bottling you added', () => {
    it('get a row of their own, apart from the sake\'s, and are counted apart', async () => {
      await expressions().put(USER, bottling)
      await addToCellar({ brandId: 7 }, { ...ONE, count: 2 })
      expect(await addToCellar({ expressionId: 'x1' }, ONE)).toEqual({ status: 'ok', count: 1 })

      expect(await shelf()).toEqual({ '7|720|s': 2, 'x:x1|720|s': 1 })
      // The bottling's row still knows its sake, so the sake's page can count it.
      const row = (await cellar().read(USER)).find((r) => r.expression)
      expect(row).toMatchObject({ brandId: 7, sake: { nameKanji: '而今' } })
    })

    it('can be kept for a bottle whose sake the catalogue lacks', async () => {
      await expressions().put(USER, { ...bottling, id: 'x2', brandId: null, line: null, name: '富久千代' })
      expect(await addToCellar({ expressionId: 'x2' }, ONE)).toEqual({ status: 'ok', count: 1 })
      expect(lookupBrand).not.toHaveBeenCalled()
      expect((await cellar().read(USER))[0]).toMatchObject({
        brandId: null,
        expression: { id: 'x2', name: '富久千代' },
        sake: { nameKanji: '富久千代', nameRomaji: null },
      })
    })

    it('cannot be added for a bottling that is not yours', async () => {
      expect(await addToCellar({ expressionId: 'nope' }, ONE)).toEqual({ status: 'not_found' })
      expect(await cellar().read(USER)).toEqual([])
    })
  })

  describe('the bottle history it keeps', () => {
    // A clock that moves on with every read, so each action has its own time.
    beforeEach(() => {
      let t = 1000
      vi.spyOn(Date, 'now').mockImplementation(() => t++)
    })
    afterEach(() => vi.restoreAllMocks())

    it('records every bottle added, opened, finished and removed, dated', async () => {
      await addToCellar({ brandId: 7 }, { ...ONE, count: 3 })
      await openCellarBottle('7|720|s')
      await finishCellarBottle('7|720|s|open')
      await removeFromCellar('7|720|s')

      expect(await ledger()).toEqual([
        ['added', 3, 720, false],
        ['opened', 1, 720, false],
        ['finished', 1, 720, false],
        ['removed', 1, 720, false],
      ])
      const events = await history().read(USER)
      expect(events.every((e) => e.at >= 1000 && e.sake.nameKanji === '而今')).toBe(true)
    })

    it('keeps the bottles that left the cellar', async () => {
      await addToCellar({ brandId: 7 }, ONE)
      await removeFromCellar('7|720|s')
      expect(await cellar().read(USER)).toEqual([])
      expect(await ledger()).toEqual([
        ['added', 1, 720, false],
        ['removed', 1, 720, false],
      ])
    })

    it('records an edited count as bottles added or removed, and a new size alone as nothing', async () => {
      await addToCellar({ brandId: 7 }, ONE)
      await editCellarRow('7|720|s', { count: 4, sizeMl: 720, nama: false })
      await editCellarRow('7|720|s', { count: 4, sizeMl: 1800, nama: true })
      await editCellarRow('7|1800|n', { count: 2, sizeMl: 1800, nama: true })
      expect(await ledger()).toEqual([
        ['added', 1, 720, false],
        ['added', 3, 720, false],
        ['removed', 2, 1800, false],
      ])
    })

    it('starts from the bottles already in the cellar the first time', async () => {
      // A cellar from before the history: two bottles, added at t=5.
      await cellar().put(USER, {
        schemaVersion: 3,
        brandId: 7,
        sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
        sizeMl: 720,
        nama: false,
        count: 2,
        openedAt: null,
        addedAt: 5,
        updatedAt: 5,
      })
      await removeFromCellar('7|720|s')
      await removeFromCellar('7|720|s')
      expect(await ledger()).toEqual([
        ['added', 2, 720, true],
        ['removed', 1, 720, false],
        ['removed', 1, 720, false],
      ])
      expect((await history().read(USER))[0]!.at).toBe(5)
    })

    it('still saves the bottle when the history cannot be written', async () => {
      history().failWrites = true
      vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(await addToCellar({ brandId: 7 }, ONE)).toEqual({ status: 'ok', count: 1 })
      expect(await shelf()).toEqual({ '7|720|s': 1 })
      expect(await history().size(USER)).toBe(0)
    })

    it('records nothing for a tap that changed nothing', async () => {
      await addToCellar({ brandId: 7 }, ONE)
      // "Finished" on a sealed row is a no-op.
      await finishCellarBottle('7|720|s')
      expect(await ledger()).toEqual([['added', 1, 720, false]])
    })
  })
})
