import type { JournalEntry } from '@/lib/schemas/journal-entry'

/**
 * What "Rate a new tasting" says about the visitor's history with a sake or
 * a bottling (§9, §9a): the newest earlier rating, or that this is the first.
 * `tastings` are newest first, as `entriesForBrand` / `entriesForExpression`
 * return them.
 */
export function lastTastingOf(
  tastings: readonly JournalEntry[],
): { kind: 'first' } | { kind: 'last'; triedAt: number; rating: number } {
  const last = tastings[0]
  return last && last.event.kind === 'rating'
    ? { kind: 'last', triedAt: last.triedAt, rating: last.event.rating }
    : { kind: 'first' }
}
