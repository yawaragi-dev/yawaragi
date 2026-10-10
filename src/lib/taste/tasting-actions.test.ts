import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Brand } from '@/lib/schemas/brand'
import type { Expression } from '@/lib/schemas/expression'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'

const h = vi.hoisted(() => ({
  journal: null as unknown,
  cellar: null as unknown,
  expressions: null as unknown,
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'user_admin' })),
}))
vi.mock('@/lib/auth/maintainer', () => ({
  currentUserIsMaintainer: vi.fn(async () => true),
}))
vi.mock('@/lib/sakenowa/lookup', () => ({
  lookupFlavorChart: vi.fn(),
  lookupBrand: vi.fn(),
}))
vi.mock('@/lib/taste/get-journal-store', () => ({
  getJournalStore: vi.fn(() => h.journal),
}))
vi.mock('@/lib/collection/get-cellar-store', () => ({
  getCellarStore: vi.fn(() => h.cellar),
}))
vi.mock('@/lib/collection/get-expression-store', () => ({
  getExpressionStore: vi.fn(() => h.expressions),
}))

import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { InMemoryExpressionStore } from '@/lib/collection/in-memory-expression-store'
import { lookupBrand, lookupFlavorChart } from '@/lib/sakenowa/lookup'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'
import { rateNewTasting, undoTasting, updateTasting } from '@/lib/taste/tasting-actions'

const CHART: FlavorChart = { source: 'sakenowa', brandId: 123, f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }
const BRAND: Brand = {
  brandId: 123,
  name: 'Nabeshima',
  nameKanji: '鍋島',
  nameRomaji: 'Nabeshima',
  breweryId: 9,
  source: 'sakenowa',
}
const USER = 'user_admin'
const journal = () => h.journal as InMemoryJournalStore
const expressions = () => h.expressions as InMemoryExpressionStore
const OWN_BOTTLING: Expression = {
  schemaVersion: 1,
  id: 'x1',
  own: true,
  brandId: 123,
  line: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
  name: 'Nabeshima Nama 2025',
  createdAt: 1,
  updatedAt: 1,
}

async function rated(rating = 4.5) {
  const result = await rateNewTasting({ brandId: 123, rating })
  if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`)
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  h.journal = new InMemoryJournalStore()
  h.cellar = new InMemoryCellarStore()
  h.expressions = new InMemoryExpressionStore()
  vi.mocked(currentUserIsMaintainer).mockResolvedValue(true)
  vi.mocked(lookupFlavorChart).mockResolvedValue(CHART)
  vi.mocked(lookupBrand).mockResolvedValue(BRAND)
})

describe('tapping a star', () => {
  it('logs a tasting with the rating, the sake name and the flavor position', async () => {
    const result = await rated(4.5)

    const [entry] = await journal().read(USER)
    expect(entry).toMatchObject({
      id: result.entryId,
      schemaVersion: 3,
      sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
      event: { kind: 'rating', rating: 4.5, brandId: 123, target: { f1: 1 } },
    })
    expect(entry!.triedAt).toBe(result.loggedAt)
  })

  it('counts which tasting of this sake it is — "2nd time"', async () => {
    expect((await rated()).tastingNumber).toBe(1)
    expect((await rated()).tastingNumber).toBe(2)
  })

  it('logs a sake with no flavor chart too, with no position on the palate', async () => {
    vi.mocked(lookupFlavorChart).mockResolvedValue(null)
    await rated()
    expect((await journal().read(USER))[0]!.event).toMatchObject({ target: null })
  })

  it('refuses a rating off the half-star scale and a brand not in the catalogue', async () => {
    expect(await rateNewTasting({ brandId: 123, rating: 3.7 })).toEqual({ status: 'invalid_input' })
    vi.mocked(lookupBrand).mockResolvedValue(null)
    expect(await rateNewTasting({ brandId: 999, rating: 4 })).toEqual({ status: 'not_found' })
  })

  it('logs a tasting of one bottling on that bottling, and counts its tastings apart from the sake\'s', async () => {
    await expressions().put(USER, OWN_BOTTLING)
    await rated() // the sake itself

    const first = await rateNewTasting({ brandId: 123, rating: 4, expressionId: 'x1' })
    expect(first).toMatchObject({ status: 'ok', tastingNumber: 1 })
    const second = await rateNewTasting({ brandId: 123, rating: 5, expressionId: 'x1' })
    expect(second).toMatchObject({ status: 'ok', tastingNumber: 2 })

    const entries = await journal().read(USER)
    expect(entries.filter((e) => e.expression).map((e) => e.expression)).toEqual([
      { id: 'x1', name: 'Nabeshima Nama 2025' },
      { id: 'x1', name: 'Nabeshima Nama 2025' },
    ])
    // It still counts toward the palate, through its sake's chart.
    expect(entries.at(-1)!.event).toMatchObject({ brandId: 123, target: { f1: 1 } })
  })

  it('refuses a bottling that is not theirs, or that belongs to another sake', async () => {
    expect(await rateNewTasting({ brandId: 123, rating: 4, expressionId: 'nope' })).toEqual({
      status: 'not_found',
    })
    await expressions().put(USER, { ...OWN_BOTTLING, brandId: 7 })
    expect(await rateNewTasting({ brandId: 123, rating: 4, expressionId: 'x1' })).toEqual({
      status: 'not_found',
    })
    expect(await journal().read(USER)).toEqual([])
  })

  it('logs a tasting of a bottle the catalogue does not know, off the palate', async () => {
    await expressions().put(USER, {
      ...OWN_BOTTLING,
      id: 'x2',
      brandId: null,
      line: null,
      name: '富久千代',
      brewery: '盛田屋',
    })

    const result = await rateNewTasting({ brandId: null, rating: 4, expressionId: 'x2' })
    expect(result).toMatchObject({ status: 'ok', tastingNumber: 1 })
    expect(lookupBrand).not.toHaveBeenCalled()

    const [entry] = await journal().read(USER)
    expect(entry).toMatchObject({
      sake: { nameKanji: '富久千代', nameRomaji: null },
      expression: { id: 'x2', name: '富久千代' },
      // No sake, so no chart to take a position from: recorded and counted,
      // skipped by the palate.
      event: { kind: 'rating', rating: 4, brandId: null, target: null },
    })
  })

  it('will not log a tasting of nothing: no sake and no bottling', async () => {
    expect(await rateNewTasting({ brandId: null, rating: 4 })).toEqual({ status: 'invalid_input' })
    // ...nor against a bottling that does belong to a sake, passed off as having none.
    await expressions().put(USER, OWN_BOTTLING)
    expect(await rateNewTasting({ brandId: null, rating: 4, expressionId: 'x1' })).toEqual({
      status: 'not_found',
    })
    expect(await journal().read(USER)).toEqual([])
  })

  it('stores nothing for someone who is not a maintainer', async () => {
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    expect(await rateNewTasting({ brandId: 123, rating: 4 })).toEqual({ status: 'forbidden' })
    expect(await journal().read(USER)).toEqual([])
  })
})

describe('after the first tap', () => {
  it('re-rating changes the same entry, not a new one', async () => {
    const { entryId } = await rated(3)
    expect(await updateTasting(entryId, { rating: 5 })).toEqual({ status: 'ok' })

    const entries = await journal().read(USER)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.event).toMatchObject({ rating: 5 })
    expect(entries[0]!.updatedAt).toBeTypeOf('number')
  })

  it('saves the note trimmed, and an empty note clears it', async () => {
    const { entryId } = await rated()
    await updateTasting(entryId, { notes: '  Sour apple, almost cider.  ' })
    expect((await journal().read(USER))[0]!.notes).toBe('Sour apple, almost cider.')
    await updateTasting(entryId, { notes: '   ' })
    expect((await journal().read(USER))[0]!.notes).toBeUndefined()
  })

  it('saves quick tags once each, and no tags as none', async () => {
    const { entryId } = await rated()
    await updateTasting(entryId, { tags: ['warm', 'withFood', 'warm'] })
    expect((await journal().read(USER))[0]!.tags).toEqual(['warm', 'withFood'])
    await updateTasting(entryId, { tags: [] })
    expect((await journal().read(USER))[0]!.tags).toBeUndefined()
  })

  it('saves detailed notes without empty parts', async () => {
    const { entryId } = await rated()
    await updateTasting(entryId, { detail: { palate: { umami: 4 }, nose: { aromas: [] } } })
    expect((await journal().read(USER))[0]!.detail).toEqual({ palate: { umami: 4 } })
  })

  it('moves a tasting to the day it really happened, and the palate replays it on that day', async () => {
    const { entryId } = await rated()
    expect(await updateTasting(entryId, { triedOn: '2026-09-21' })).toEqual({ status: 'ok' })
    const entry = (await journal().read(USER))[0]!
    // Noon UTC, so the day reads the same wherever the list is drawn (it
    // formats dates in UTC).
    expect(entry.triedAt).toBe(Date.UTC(2026, 8, 21, 12))
    expect(entry.event.occurredAt).toBe(entry.triedAt)
    // The audit field stays when it was logged.
    expect(entry.createdAt).not.toBe(entry.triedAt)
  })

  it('refuses a tasting date in the future, before 2000, or that is not a date', async () => {
    const { entryId } = await rated()
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    expect(await updateTasting(entryId, { triedOn: tomorrow })).toEqual({ status: 'invalid_input' })
    expect(await updateTasting(entryId, { triedOn: '1999-12-31' })).toEqual({ status: 'invalid_input' })
    expect(await updateTasting(entryId, { triedOn: '2026-02-30' })).toEqual({ status: 'invalid_input' })
  })

  it('refuses an empty change and an unknown entry', async () => {
    const { entryId } = await rated()
    expect(await updateTasting(entryId, {})).toEqual({ status: 'invalid_input' })
    expect(await updateTasting('nope', { rating: 4 })).toEqual({ status: 'not_found' })
  })

  it('Undo removes the tasting', async () => {
    const { entryId } = await rated()
    expect(await undoTasting(entryId)).toEqual({ status: 'ok' })
    expect(await journal().read(USER)).toEqual([])
  })
})
