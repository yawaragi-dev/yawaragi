import { KojiSchema, type Koji } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { ScanGradeSchema, type ScanGrade } from '@/lib/schemas/label-scan-extraction'

/**
 * Filtering §11's journal (design question W, built ahead of the spec):
 * by the brewery's prefecture, the stars, and — for tastings logged against a
 * bottling — its grade, style words and koji. Pure: the page looks the facts
 * up and hands them in, so this decides only what a filter keeps and what the
 * chips can offer.
 */

/** What a tasting can be filtered by, looked up for each entry. */
export interface EntryFacts {
  /** The brewery's prefecture (Sakenowa areaId); null for a bottling with no sake. */
  areaId: number | null
  grade: ScanGrade | null
  /** The bottling's style words as the visitor stored them. */
  styles: readonly string[]
  koji: Koji | null
  /** The sake's brewery, for the journal's numbers; absent where it is not looked up. */
  brewery?: { id: number; nameKanji: string; nameRomaji: string | null } | null
}

export interface JournalFilter {
  areaId: number | null
  stars: number | null
  grade: ScanGrade | null
  /** Compared without case: "nama" and "Nama" are one word. */
  style: string | null
  koji: Koji | null
}

type Query = Record<string, string | string[] | undefined>

const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)

/** The filter a journal URL names. A value it cannot read is no filter, never an empty list. */
export function parseJournalFilter(query: Query): JournalFilter {
  const pref = Number(one(query.pref))
  const stars = Number(one(query.stars))
  const grade = ScanGradeSchema.safeParse(one(query.grade))
  const koji = KojiSchema.safeParse(one(query.koji))
  const style = one(query.style)?.trim()
  return {
    areaId: Number.isInteger(pref) && pref > 0 && pref <= 47 ? pref : null,
    stars: Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null,
    grade: grade.success ? grade.data : null,
    style: style ? style.slice(0, 24) : null,
    koji: koji.success ? koji.data : null,
  }
}

/** The filter as a `/collection` query, Journal segment included. */
export function journalFilterQuery(filter: JournalFilter): Record<string, string> {
  const query: Record<string, string> = { tab: 'journal' }
  if (filter.areaId !== null) query.pref = String(filter.areaId)
  if (filter.stars !== null) query.stars = String(filter.stars)
  if (filter.grade !== null) query.grade = filter.grade
  if (filter.style !== null) query.style = filter.style
  if (filter.koji !== null) query.koji = filter.koji
  return query
}

export function withJournalFilter(filter: JournalFilter, patch: Partial<JournalFilter>): JournalFilter {
  return { ...filter, ...patch }
}

export function isFiltered(filter: JournalFilter): boolean {
  return Object.values(filter).some((value) => value !== null)
}

export function ratingOfEntry(entry: JournalEntry): number | null {
  return entry.event.kind === 'rating' ? entry.event.rating : null
}

function keeps(entry: JournalEntry, facts: EntryFacts, filter: JournalFilter): boolean {
  if (filter.areaId !== null && facts.areaId !== filter.areaId) return false
  if (filter.stars !== null && ratingOfEntry(entry) !== filter.stars) return false
  if (filter.grade !== null && facts.grade !== filter.grade) return false
  if (filter.koji !== null && facts.koji !== filter.koji) return false
  if (filter.style !== null) {
    const wanted = filter.style.toLocaleLowerCase()
    if (!facts.styles.some((style) => style.toLocaleLowerCase() === wanted)) return false
  }
  return true
}

export function filterJournal(
  entries: readonly JournalEntry[],
  factsOf: (entry: JournalEntry) => EntryFacts,
  filter: JournalFilter,
): JournalEntry[] {
  return entries.filter((entry) => keeps(entry, factsOf(entry), filter))
}

export interface Facet<V> {
  value: V
  count: number
}

export interface JournalFacets {
  prefectures: Facet<number>[]
  stars: Facet<number>[]
  grades: Facet<ScanGrade>[]
  /** Spelled as first seen; counted without case. */
  styles: Facet<string>[]
  koji: Facet<Koji>[]
}

/** Count `keyOf` over the entries: most common first, ties in order of first appearance. */
function tally<V>(values: readonly V[], keyOf: (value: V) => string = String): Facet<V>[] {
  const byKey = new Map<string, Facet<V>>()
  for (const value of values) {
    const key = keyOf(value)
    const seen = byKey.get(key)
    if (seen) seen.count += 1
    else byKey.set(key, { value, count: 1 })
  }
  // Array sort is stable, so equal counts keep the order they were met in.
  return [...byKey.values()].sort((a, b) => b.count - a.count)
}

/** What the chips can offer: only values that occur, with how many tastings each keeps. */
export function journalFacets(entries: readonly JournalEntry[], factsOf: (entry: JournalEntry) => EntryFacts): JournalFacets {
  const all = entries.map((entry) => ({ entry, facts: factsOf(entry) }))
  const stars = all.map(({ entry }) => ratingOfEntry(entry)).filter((s): s is number => s !== null)
  return {
    prefectures: tally(all.map(({ facts }) => facts.areaId).filter((a): a is number => a !== null)),
    stars: tally(stars).sort((a, b) => b.value - a.value),
    grades: tally(all.map(({ facts }) => facts.grade).filter((g): g is ScanGrade => g !== null)),
    styles: tally(
      all.flatMap(({ facts }) => [...new Map(facts.styles.map((s) => [s.toLocaleLowerCase(), s])).values()]),
      (style) => style.toLocaleLowerCase(),
    ),
    koji: tally(all.map(({ facts }) => facts.koji).filter((k): k is Koji => k !== null)),
  }
}

/**
 * The facets as the chips offer them while a filter is set: each chip counts
 * the tastings its value would leave with the *other* filters applied, so a
 * number is always what tapping it shows, and a chip's own value never hides
 * its alternatives.
 */
export function journalFacetsUnder(
  entries: readonly JournalEntry[],
  factsOf: (entry: JournalEntry) => EntryFacts,
  filter: JournalFilter,
): JournalFacets {
  const without = (patch: Partial<JournalFilter>) =>
    journalFacets(filterJournal(entries, factsOf, withJournalFilter(filter, patch)), factsOf)
  return {
    prefectures: without({ areaId: null }).prefectures,
    stars: without({ stars: null }).stars,
    grades: without({ grade: null }).grades,
    styles: without({ style: null }).styles,
    koji: without({ koji: null }).koji,
  }
}
