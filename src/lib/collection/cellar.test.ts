import { describe, expect, it } from 'vitest'
import {
  DRINK_SOON_DAYS,
  addBottle,
  cellarFreshness,
  cellarSummary,
  finishBottle,
  removeBottle,
  openBottle,
  sortCellar,
} from '@/lib/collection/cellar'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'

const DAY = 24 * 60 * 60 * 1000
const SAKE = { brandId: 7, nameKanji: '而今', nameRomaji: 'Jikon' }

const row = (over: Partial<CellarBottle> = {}): CellarBottle => ({
  ...addBottle(undefined, SAKE, 1000),
  ...over,
})

describe('adding to the cellar', () => {
  it('starts a sealed row of one', () => {
    expect(addBottle(undefined, SAKE, 1000)).toEqual({
      schemaVersion: 1,
      brandId: 7,
      sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
      count: 1,
      openedAt: null,
      addedAt: 1000,
      updatedAt: 1000,
    })
  })

  it('adds another bottle to the same row rather than a second row', () => {
    const second = addBottle(row(), SAKE, 2000)
    expect(second.count).toBe(2)
    expect(second.addedAt).toBe(1000)
    expect(second.updatedAt).toBe(2000)
  })
})

describe('removing a sealed bottle', () => {
  it('takes one bottle off a row of several, not the whole row', () => {
    expect(removeBottle(row({ count: 3 }), 9000)).toMatchObject({ count: 2, updatedAt: 9000 })
  })

  it('removing the last bottle removes the row', () => {
    expect(removeBottle(row({ count: 1 }), 9000)).toBeNull()
  })
})

describe('opening and finishing', () => {
  it('opening dates the row; opening it again does not reset the clock', () => {
    const opened = openBottle(row(), 5000)
    expect(opened.openedAt).toBe(5000)
    expect(openBottle(opened, 9000).openedAt).toBe(5000)
  })

  it('finishing the last bottle removes the row', () => {
    expect(finishBottle(row({ openedAt: 5000 }), 9000)).toBeNull()
  })

  it('finishing one of several leaves the rest, all sealed', () => {
    expect(finishBottle(row({ count: 3, openedAt: 5000 }), 9000)).toMatchObject({
      count: 2,
      openedAt: null,
    })
  })
})

describe('freshness', () => {
  it('a sealed bottle keeps', () => {
    expect(cellarFreshness(row(), 50 * DAY)).toEqual({ kind: 'unopened' })
  })

  it(`counts whole days open, and asks to finish it from day ${DRINK_SOON_DAYS}`, () => {
    const opened = row({ openedAt: 0 })
    expect(cellarFreshness(opened, 4 * DAY + 1)).toEqual({ kind: 'open', days: 4, drinkSoon: false })
    expect(cellarFreshness(opened, DRINK_SOON_DAYS * DAY)).toMatchObject({ drinkSoon: true })
  })
})

describe('the list', () => {
  it('puts bottles to finish soon first, then open ones, then sealed, newest first within each', () => {
    const now = 30 * DAY
    const sealedOld = row({ brandId: 1, addedAt: 1 })
    const sealedNew = row({ brandId: 2, addedAt: 2 })
    const open = row({ brandId: 3, openedAt: now - DAY })
    const soon = row({ brandId: 4, openedAt: now - 12 * DAY })
    expect(sortCellar([sealedOld, open, sealedNew, soon], now).map((b) => b.brandId)).toEqual([
      4, 3, 2, 1,
    ])
  })

  it('summarises bottles, not rows, and open rows', () => {
    expect(cellarSummary([row({ count: 2, openedAt: 5 }), row({ brandId: 8 })])).toEqual({
      bottles: 3,
      open: 1,
    })
  })
})
