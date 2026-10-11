import { describe, expect, it } from 'vitest'
import {
  DRINK_SOON_DAYS,
  DRINK_SOON_DAYS_NAMA,
  addBottles,
  applyCellarChange,
  bottlesOf,
  cellarFreshness,
  cellarSummary,
  editRow,
  finishOne,
  newCellarRow,
  openOne,
  removeOne,
  settleOpenRows,
  sortCellar,
} from '@/lib/collection/cellar'
import { type CellarBottle, cellarRowKey } from '@/lib/schemas/cellar-bottle'

const DAY = 24 * 60 * 60 * 1000
const SAKE = { brandId: 7, nameKanji: '而今', nameRomaji: 'Jikon' }
const BOTTLING = { ...SAKE, expression: { id: 'x1', name: 'Jikon Nama 2025' } }
const STD = { sizeMl: 720, nama: false } as const

const row = (over: Partial<CellarBottle> = {}): CellarBottle => ({
  ...newCellarRow(SAKE, STD, 1, 1000),
  ...over,
})
/** Rows after a rule ran: what the cellar looks like, as [key, count] pairs. */
const after = (rows: readonly CellarBottle[], change: ReturnType<typeof openOne>) =>
  Object.fromEntries(applyCellarChange(rows, change).map((r) => [cellarRowKey(r), r.count]))

describe('adding to the cellar', () => {
  it('starts a sealed row with the size and kind the sheet gave', () => {
    const change = addBottles([], SAKE, { sizeMl: 1800, nama: true }, 2, 1000)
    expect(change.put).toEqual([
      {
        schemaVersion: 3,
        brandId: 7,
        sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
        sizeMl: 1800,
        nama: true,
        count: 2,
        openedAt: null,
        addedAt: 1000,
        updatedAt: 1000,
      },
    ])
  })

  it('adds to the row of the same thing, size and kind rather than starting a second', () => {
    const rows = [row()]
    const change = addBottles(rows, SAKE, STD, 2, 2000)
    expect(after(rows, change)).toEqual({ '7|720|s': 3 })
    expect(change.put[0]).toMatchObject({ addedAt: 1000, updatedAt: 2000 })
  })

  it('keeps another size, a nama bottle, and a bottling each on a row of their own', () => {
    let rows: CellarBottle[] = [row()]
    rows = applyCellarChange(rows, addBottles(rows, SAKE, { sizeMl: 1800, nama: false }, 1, 2))
    rows = applyCellarChange(rows, addBottles(rows, SAKE, { sizeMl: 720, nama: true }, 1, 3))
    rows = applyCellarChange(rows, addBottles(rows, BOTTLING, STD, 1, 4))
    expect(rows.map(cellarRowKey).sort()).toEqual(['7|1800|s', '7|720|n', '7|720|s', 'x:x1|720|s'])
  })

  it('never adds onto the open bottle: a new one waits sealed beside it', () => {
    const rows = [row({ openedAt: 500 })]
    const change = addBottles(rows, SAKE, STD, 1, 2000)
    expect(after(rows, change)).toEqual({ '7|720|s|open': 1, '7|720|s': 1 })
  })
})

describe('opening and finishing', () => {
  it('opening takes one bottle off the sealed row onto a row of its own, dated', () => {
    const rows = [row({ count: 3 })]
    const change = openOne(rows, '7|720|s', 5000)
    expect(after(rows, change)).toEqual({ '7|720|s': 2, '7|720|s|open': 1 })
    expect(change.put.find((r) => r.openedAt !== null)!.openedAt).toBe(5000)
  })

  it('opening the last sealed bottle leaves only the open row', () => {
    const rows = [row()]
    expect(after(rows, openOne(rows, '7|720|s', 5000))).toEqual({ '7|720|s|open': 1 })
  })

  it('a second bottle opened joins the open one, and the clock stays with the first', () => {
    const rows = [row({ count: 2 }), row({ openedAt: 5000 })]
    const change = openOne(rows, '7|720|s', 9000)
    expect(after(rows, change)).toEqual({ '7|720|s': 1, '7|720|s|open': 2 })
    expect(change.put.find((r) => r.openedAt !== null)!.openedAt).toBe(5000)
  })

  it('finishing takes the open bottle and leaves the sealed ones alone', () => {
    const rows = [row({ count: 2 }), row({ openedAt: 5000 })]
    expect(after(rows, finishOne(rows, '7|720|s|open', 9000))).toEqual({ '7|720|s': 2 })
  })

  it('does nothing when asked to open an open row, or finish a sealed one', () => {
    const rows = [row({ count: 2 }), row({ openedAt: 5000 })]
    expect(openOne(rows, '7|720|s|open', 9000)).toEqual({ put: [], removeKeys: [] })
    expect(finishOne(rows, '7|720|s', 9000)).toEqual({ put: [], removeKeys: [] })
    expect(openOne(rows, 'nope', 9000)).toEqual({ put: [], removeKeys: [] })
  })
})

describe('removing a sealed bottle', () => {
  it('takes one bottle off a row of several, and the last one takes the row', () => {
    const rows = [row({ count: 2 })]
    const once = removeOne(rows, '7|720|s', 9000)
    expect(after(rows, once)).toEqual({ '7|720|s': 1 })
    const left = applyCellarChange(rows, once)
    expect(after(left, removeOne(left, '7|720|s', 9001))).toEqual({})
  })
})

describe('editing a row in the sheet', () => {
  it('changes the count in place', () => {
    const rows = [row({ count: 2 })]
    expect(after(rows, editRow(rows, '7|720|s', { ...STD, count: 5 }, 9000))).toEqual({ '7|720|s': 5 })
  })

  it('a new size or nama moves the row, because it is now a different bottle', () => {
    const rows = [row({ count: 2 })]
    expect(
      after(rows, editRow(rows, '7|720|s', { sizeMl: 1800, nama: true, count: 2 }, 9000)),
    ).toEqual({ '7|1800|n': 2 })
  })

  it('joins the row that is already that size, rather than leaving two the same', () => {
    const rows = [row({ count: 2 }), row({ sizeMl: 1800, count: 1 })]
    expect(
      after(rows, editRow(rows, '7|720|s', { sizeMl: 1800, nama: false, count: 2 }, 9000)),
    ).toEqual({ '7|1800|s': 3 })
  })

  it('gives a row from before the sheet its size', () => {
    const rows = [row({ sizeMl: null })]
    expect(cellarRowKey(rows[0]!)).toBe('7')
    expect(after(rows, editRow(rows, '7', { ...STD, count: 1 }, 9000))).toEqual({ '7|720|s': 1 })
  })
})

describe('rows written before the sheet', () => {
  it('keep their key while sealed, so nothing moves', () => {
    const old = row({ sizeMl: null, count: 2 })
    expect(cellarRowKey(old)).toBe('7')
    expect(settleOpenRows([old], 9000)).toEqual({ put: [], removeKeys: [] })
  })

  it('with one of several open: the open bottle gets its own row, the rest stay sealed', () => {
    const old = row({ sizeMl: null, count: 3, openedAt: 5000 })
    const change = settleOpenRows([old], 9000)
    expect(change.removeKeys).toEqual(['7'])
    expect(change.put.map((r) => [cellarRowKey(r), r.count, r.openedAt])).toEqual([
      ['7|open', 1, 5000],
      ['7', 2, null],
    ])
  })

  it('a single open bottle moves to the open key', () => {
    const old = row({ sizeMl: null, openedAt: 5000 })
    const change = settleOpenRows([old], 9000)
    expect(change.removeKeys).toEqual(['7'])
    expect(change.put.map(cellarRowKey)).toEqual(['7|open'])
  })

  it('leaves alone every row that has a size: those were written in place', () => {
    const rows = [row({ count: 2 }), row({ openedAt: 5000 })]
    expect(settleOpenRows(rows, 9000)).toEqual({ put: [], removeKeys: [] })
  })
})

describe('counting', () => {
  it('counts a sake\'s bottles across sizes, open or sealed, apart from its bottlings\'', () => {
    const rows = [
      row({ count: 2 }),
      row({ sizeMl: 1800 }),
      row({ openedAt: 5 }),
      { ...newCellarRow(BOTTLING, STD, 4, 1) },
      row({ brandId: 8 }),
    ]
    expect(bottlesOf(rows, { brandId: 7 })).toBe(4)
    expect(bottlesOf(rows, { expressionId: 'x1' })).toBe(4)
  })

  it('summarises bottles, not rows, and open rows', () => {
    expect(cellarSummary([row({ count: 2 }), row({ openedAt: 5 }), row({ brandId: 8 })])).toEqual({
      bottles: 4,
      open: 1,
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

  it(`asks sooner for nama: from day ${DRINK_SOON_DAYS_NAMA}`, () => {
    const opened = row({ openedAt: 0, nama: true })
    expect(cellarFreshness(opened, 4 * DAY)).toMatchObject({ drinkSoon: false })
    expect(cellarFreshness(opened, DRINK_SOON_DAYS_NAMA * DAY)).toMatchObject({ drinkSoon: true })
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
})
