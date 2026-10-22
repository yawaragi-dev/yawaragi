import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { type EntryFacts, type Facet, journalFacets, ratingOfEntry } from './journal-filter'

/**
 * "Your journal in numbers" (design question X, built ahead of the spec):
 * plain counts over the visitor's own tastings. Pure, over the same facts the
 * journal's filters use. Nothing here counts bottles drunk or amounts: a
 * tally of consumption is the wrong thing for an alcohol app to celebrate
 * (JMStV), so it counts tastings, sakes, breweries and places.
 */

/** Below this many tastings the numbers say more about chance than taste. */
export const JOURNAL_NUMBERS_FROM = 5

export interface BreweryNames {
  id: number
  nameKanji: string
  nameRomaji: string | null
}

export interface JournalNumbers {
  tastings: number
  /** Different things tasted: catalogue sakes plus own bottlings without one. */
  sakes: number
  breweries: number
  prefectures: { tasted: number; top: Facet<number>[] }
  stars: { spread: Record<1 | 2 | 3 | 4 | 5, number>; average: number | null }
  /** Breweries tasted at least twice — "you return to" — up to three, most tasted first. */
  topBreweries: { brewery: BreweryNames; count: number; average: number }[]
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10

export function journalNumbers(
  entries: readonly JournalEntry[],
  factsOf: (entry: JournalEntry) => EntryFacts,
): JournalNumbers | null {
  if (entries.length < JOURNAL_NUMBERS_FROM) return null

  const things = new Set<string>()
  const breweries = new Map<number, { brewery: BreweryNames; stars: number[] }>()
  const spread: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const allStars: number[] = []

  for (const entry of entries) {
    const facts = factsOf(entry)
    const brandId = entry.event.kind === 'rating' ? entry.event.brandId : null
    things.add(brandId !== null ? `sake:${brandId}` : `bottling:${entry.expression?.id ?? entry.id}`)
    const rating = ratingOfEntry(entry)
    if (rating !== null && rating >= 1 && rating <= 5) {
      spread[rating as 1 | 2 | 3 | 4 | 5] += 1
      allStars.push(rating)
    }
    if (facts.brewery) {
      const seen = breweries.get(facts.brewery.id) ?? { brewery: facts.brewery, stars: [] }
      if (rating !== null) seen.stars.push(rating)
      breweries.set(facts.brewery.id, seen)
    }
  }

  const prefectures = journalFacets(entries, factsOf).prefectures
  const average = (list: number[]) => (list.length ? oneDecimal(list.reduce((a, b) => a + b, 0) / list.length) : null)

  return {
    tastings: entries.length,
    sakes: things.size,
    breweries: breweries.size,
    prefectures: { tasted: prefectures.length, top: prefectures.slice(0, 5) },
    stars: { spread, average: average(allStars) },
    topBreweries: [...breweries.values()]
      .map(({ brewery, stars }) => ({ brewery, count: stars.length, average: average(stars) ?? 0 }))
      .filter(({ count }) => count >= 2)
      .sort((a, b) => b.count - a.count || b.average - a.average)
      .slice(0, 3),
  }
}
