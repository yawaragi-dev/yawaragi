import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ journal: null as unknown, cellar: null as unknown }))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_admin' })) }))
vi.mock('@/lib/auth/maintainer', () => ({ currentUserIsMaintainer: vi.fn(async () => true) }))
vi.mock('@/lib/sakenowa/lookup', () => ({ lookupBrand: vi.fn() }))
vi.mock('@/lib/taste/get-journal-store', () => ({ getJournalStore: vi.fn(() => h.journal) }))
vi.mock('@/lib/collection/get-cellar-store', () => ({ getCellarStore: vi.fn(() => h.cellar) }))

import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import {
  addToCellar,
  finishCellarBottle,
  openCellarBottle,
  removeFromCellar,
} from '@/lib/collection/cellar-actions'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'

const USER = 'user_admin'
const cellar = () => h.cellar as InMemoryCellarStore

beforeEach(() => {
  vi.clearAllMocks()
  h.journal = new InMemoryJournalStore()
  h.cellar = new InMemoryCellarStore()
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
    expect(await addToCellar(7)).toEqual({ status: 'ok', count: 1 })
    expect(await addToCellar(7)).toEqual({ status: 'ok', count: 2 })
    const rows = await cellar().read(USER)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sake: { nameKanji: '而今' }, count: 2, openedAt: null })
  })

  it('opens, finishes one of two, and finishing the last takes the row', async () => {
    await addToCellar(7)
    await addToCellar(7)
    await openCellarBottle(7)
    expect((await cellar().read(USER))[0]!.openedAt).toBeTypeOf('number')

    expect(await finishCellarBottle(7)).toEqual({ status: 'ok', count: 1 })
    expect((await cellar().read(USER))[0]!.openedAt).toBeNull()
    expect(await finishCellarBottle(7)).toEqual({ status: 'ok', count: 0 })
    expect(await cellar().read(USER)).toEqual([])
  })

  it('removes one bottle at a time, and the row with the last one', async () => {
    await addToCellar(7)
    await addToCellar(7)
    expect(await removeFromCellar(7)).toEqual({ status: 'ok', count: 1 })
    expect((await cellar().read(USER))[0]!.count).toBe(1)
    expect(await removeFromCellar(7)).toEqual({ status: 'ok', count: 0 })
    expect(await cellar().read(USER)).toEqual([])
  })

  it('refuses a sake not in the catalogue, a row that is not there, and a non-maintainer', async () => {
    vi.mocked(lookupBrand).mockResolvedValue(null)
    expect(await addToCellar(9)).toEqual({ status: 'not_found' })
    expect(await openCellarBottle(9)).toEqual({ status: 'not_found' })
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    expect(await addToCellar(7)).toEqual({ status: 'forbidden' })
  })
})
