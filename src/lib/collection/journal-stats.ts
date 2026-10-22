import type { FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import type { ScanGrade } from '@/lib/schemas/label-scan-extraction'
import { type BreweryFacet, type EntryFacts, type Facet, journalFacets, ratingOfEntry, starBand } from './journal-filter'

/**
 * "Your journal in numbers" (design v1.9, X): plain counts over the visitor's
 * own tastings, worked out on request and shown only to them. Pure, over the
 * same facts the journal's filters use. Nothing here counts drinking over
 * time — no streaks, no "this month", no litres (X5): it counts tastings,
 * sakes, breweries and places, and ranks breweries by rating, never by how
 * many were tasted.
 */

/** The screen opens from this many tastings; before, Palate's row is a teaser (X4). */
export const JOURNAL_NUMBERS_FROM = 5

/** A rating this high or higher counts as a "high rating" for the surprise. */
const HIGH_RATING = 4

const AXES: readonly FlavorAxis[] = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']

export interface JournalSurprise {
  entry: JournalEntry
  rating: number
  /** The two axes where the sake sits furthest above the visitor's palate. */
  itsLean: [FlavorAxis, FlavorAxis]
  /** The axis where the visitor's palate sits furthest above the sake. */
  yourLean: FlavorAxis
}

export interface JournalNumbers {
  tastings: number
  /** Different things tasted: catalogue sakes plus own bottlings without one. */
  sakes: number
  breweries: number
  /** Every prefecture tasted, most first. */
  prefectures: Facet<number>[]
  stars: { spread: Record<1 | 2 | 3 | 4 | 5, number>; average: number | null }
  /** Breweries tasted at least twice, highest average first, up to three (X3, X5). */
  topBreweries: { brewery: BreweryFacet; count: number; average: number }[]
  /** Grades as named by the visitor's bottlings, most first, and how many tastings name one. */
  grades: Facet<ScanGrade>[]
  withGrade: number
  surprise: JournalSurprise | null
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10
const average = (list: readonly number[]) => (list.length ? oneDecimal(list.reduce((a, b) => a + b, 0) / list.length) : null)

/**
 * The surprise (X3): of the visitor's high ratings, the one whose flavor
 * chart is furthest from their own palate, with the axes that make it so.
 * Only tastings of a sake with a chart can be one.
 */
export function journalSurprise(entries: readonly JournalEntry[], palate: FlavorProfile | null): JournalSurprise | null {
  if (!palate) return null
  let best: { entry: JournalEntry; rating: number; target: FlavorProfile; distance: number } | null = null
  for (const entry of entries) {
    if (entry.event.kind !== 'rating' || !entry.event.target || entry.event.rating < HIGH_RATING) continue
    const target = entry.event.target
    const distance = Math.hypot(...AXES.map((axis) => target[axis] - palate[axis]))
    if (!best || distance > best.distance) best = { entry, rating: entry.event.rating, target, distance }
  }
  if (!best || best.distance === 0) return null
  const above = [...AXES].sort((a, b) => best.target[b] - palate[b] - (best.target[a] - palate[a]))
  const below = [...AXES].sort((a, b) => palate[b] - best.target[b] - (palate[a] - best.target[a]))
  return { entry: best.entry, rating: best.rating, itsLean: [above[0]!, above[1]!], yourLean: below[0]! }
}

export function journalNumbers(
  entries: readonly JournalEntry[],
  factsOf: (entry: JournalEntry) => EntryFacts,
  palate: FlavorProfile | null = null,
): JournalNumbers | null {
  if (entries.length < JOURNAL_NUMBERS_FROM) return null

  const things = new Set<string>()
  const breweries = new Map<number, { brewery: BreweryFacet; stars: number[] }>()
  const spread: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const allStars: number[] = []

  for (const entry of entries) {
    const facts = factsOf(entry)
    const brandId = entry.event.kind === 'rating' ? entry.event.brandId : null
    things.add(brandId !== null ? `sake:${brandId}` : `bottling:${entry.expression?.id ?? entry.id}`)
    const rating = ratingOfEntry(entry)
    if (rating !== null && rating > 0) {
      spread[starBand(rating) as 1 | 2 | 3 | 4 | 5] += 1
      allStars.push(rating)
    }
    if (facts.brewery) {
      const seen = breweries.get(facts.brewery.id) ?? { brewery: facts.brewery, stars: [] }
      if (rating !== null) seen.stars.push(rating)
      breweries.set(facts.brewery.id, seen)
    }
  }

  const facets = journalFacets(entries, factsOf)
  return {
    tastings: entries.length,
    sakes: things.size,
    breweries: breweries.size,
    prefectures: facets.prefectures,
    stars: { spread, average: average(allStars) },
    topBreweries: [...breweries.values()]
      .filter(({ stars }) => stars.length >= 2)
      .map(({ brewery, stars }) => ({ brewery, count: stars.length, average: average(stars) ?? 0 }))
      .sort((a, b) => b.average - a.average || b.count - a.count)
      .slice(0, 3),
    grades: facets.grades,
    withGrade: entries.length - facets.noGrade,
    surprise: journalSurprise(entries, palate),
  }
}
