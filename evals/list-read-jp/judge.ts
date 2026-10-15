import type { PhotoItem } from '../label-scan-jp/schemas'

/**
 * How a list read did against one photo's `items` (the label-scan corpus's
 * per-line ground truth for menus and shelves). Pure, so the scoring is
 * unit-tested apart from any model or catalogue.
 *
 * - **found**: a sake the catalogue has, shown as a row of that sake.
 * - **missed**: a sake the catalogue has, not shown as its row (left under
 *   "Couldn't match", read as something else, or not read at all).
 * - **wrong rows**: a row for a sake that is not on the photo — the costly
 *   error, because the visitor is told a sake is on the list that is not.
 * - **not sake shown as sake**: a row for a non-sake item's catalogue entry
 *   (Sakenowa lists a few shochu); its flavor chart is not sake data.
 */
export interface ListVerdict {
  findable: number
  found: number
  missedItems: string[]
  wrongRows: number[]
  notSakeShownAsSake: number[]
}

export function judgeList(items: readonly PhotoItem[], shownBrandIds: readonly number[]): ListVerdict {
  const shown = new Set(shownBrandIds)
  const sakeItems = items.filter((i) => !i.unreadable && (i.drink === undefined || i.drink === 'sake'))
  const findable = sakeItems.filter((i) => i.expectedBrandIds.length > 0)
  const found = findable.filter((i) => i.expectedBrandIds.some((id) => shown.has(id)))
  const sakeIds = new Set(sakeItems.flatMap((i) => i.expectedBrandIds))
  const notSakeIds = new Set(
    items.filter((i) => i.drink !== undefined && i.drink !== 'sake').flatMap((i) => i.expectedBrandIds),
  )
  return {
    findable: findable.length,
    found: found.length,
    missedItems: findable.filter((i) => !found.includes(i)).map((i) => i.name_ja ?? '?'),
    wrongRows: shownBrandIds.filter((id) => !sakeIds.has(id) && !notSakeIds.has(id)),
    notSakeShownAsSake: shownBrandIds.filter((id) => notSakeIds.has(id)),
  }
}
