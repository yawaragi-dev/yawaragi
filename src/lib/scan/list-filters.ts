import type { ListCurrency } from '@/lib/schemas/list-scan-extraction'
import type { ListRow } from './list-action-state'

/** §7's chips: "Good warm", "Under ¥1,000", "New to me". */
export type ListFilter = 'warm' | 'cheap' | 'new'

/**
 * The glass price "Under …" means, per currency. The design draws "Under
 * ¥1,000" for a Japanese menu; a menu in Germany prints euros, where a glass
 * of sake runs about ¥1,000's worth at €9–14. 10 is a round number on the
 * same side of a glass's usual price. `null` for a currency with no sensible
 * round limit, where the chip is left out.
 */
const CHEAP: Partial<Record<ListCurrency, number>> = {
  JPY: 1000,
  EUR: 10,
  USD: 10,
  GBP: 10,
  CHF: 10,
}

export function cheapPriceLimit(currency: ListCurrency | undefined): number | null {
  return currency ? (CHEAP[currency] ?? null) : null
}

/**
 * The rows every chip that is on lets through. A sake with several bottlings
 * on the list passes when one of them does: "Under ¥1,000" is about what can
 * be ordered, and one bottling under it is enough.
 */
export function filterListRows(rows: readonly ListRow[], filters: readonly ListFilter[], cheap: number | null): ListRow[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      switch (filter) {
        case 'warm':
          return row.lines.some((l) => l.warm)
        case 'cheap':
          return cheap !== null && row.lines.some((l) => l.price !== undefined && l.price < cheap)
        case 'new':
          return row.yourRating === null
      }
    }),
  )
}
