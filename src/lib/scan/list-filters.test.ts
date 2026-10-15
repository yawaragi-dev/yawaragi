import { describe, expect, it } from 'vitest'
import type { ListLine, ListRow } from './list-action-state'
import { cheapPriceLimit, filterListRows } from './list-filters'

const row = (brandId: number, lines: Partial<ListLine>[], yourRating: number | null = null): ListRow => ({
  brandId,
  sakeHref: `/sake/${brandId}`,
  nameKanji: '酒',
  nameRomaji: null,
  chart: null,
  lines: lines.map((l, i) => ({ index: i, printed: '酒', nameAsPrinted: '酒', ...l })),
  fit: null,
  reason: { kind: 'no_chart' },
  yourRating,
})

const ROWS = [
  row(1, [{ price: 1100, warm: true }]),
  row(2, [{ price: 1300 }, { price: 950 }]),
  row(3, [{ price: 800 }], 4),
]

describe('the chips on a menu', () => {
  it('lets every row through with no chip on', () => {
    expect(filterListRows(ROWS, [], 1000)).toHaveLength(3)
  })

  it('keeps a sake one of whose bottlings is under the price', () => {
    expect(filterListRows(ROWS, ['cheap'], 1000).map((r) => r.brandId)).toEqual([2, 3])
  })

  it('keeps what the menu offers warm, and what the visitor has not rated', () => {
    expect(filterListRows(ROWS, ['warm'], 1000).map((r) => r.brandId)).toEqual([1])
    expect(filterListRows(ROWS, ['new'], 1000).map((r) => r.brandId)).toEqual([1, 2])
  })

  it('applies every chip that is on', () => {
    expect(filterListRows(ROWS, ['cheap', 'new'], 1000).map((r) => r.brandId)).toEqual([2])
  })

  it('has a round price limit for yen and euros, and none for a currency it cannot judge', () => {
    expect(cheapPriceLimit('JPY')).toBe(1000)
    expect(cheapPriceLimit('EUR')).toBe(10)
    expect(cheapPriceLimit('other')).toBeNull()
    expect(cheapPriceLimit(undefined)).toBeNull()
  })
})
