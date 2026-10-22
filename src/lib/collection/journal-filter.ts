import type { Koji } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { ScanGradeSchema, type ScanGrade } from '@/lib/schemas/label-scan-extraction'

/**
 * Filtering §11's journal (design v1.9, W): Prefecture, Rating and Grade as
 * chips, Style, Brewery and Month under More, and a search over names,
 * breweries and notes. Several values in one chip mean "any of"; chips
 * together mean "all of". Pure: the page looks the facts up and hands them
 * in, so this decides only what a filter keeps and what the chips offer.
 */

/** The chips show from this many tastings (W1): below it a journal is short enough to read. */
export const JOURNAL_FILTERS_FROM = 8

/** What a tasting can be filtered by, looked up for each entry. */
export interface EntryFacts {
  /** The brewery's prefecture (Sakenowa areaId); null for a bottling with no sake. */
  areaId: number | null
  grade: ScanGrade | null
  /** The bottling's style words as the visitor stored them. */
  styles: readonly string[]
  koji: Koji | null
  /** The sake's brewery; absent where it is not looked up. */
  brewery?: { id: number; nameKanji: string; nameRomaji: string | null } | null
}

export interface JournalFilter {
  areaIds: readonly number[]
  /** Star bands: 5 is "5 stars", 4 is "4–4.5 stars", … 1 is "1–1.5 stars" (½ joins 1). */
  stars: readonly number[]
  grades: readonly ScanGrade[]
  /** Compared without case: "nama" and "Nama" are one word. */
  styles: readonly string[]
  breweries: readonly number[]
  /** `YYYY-MM`, the month the tasting was had. */
  months: readonly string[]
  /** A name, a brewery or a word in a note (W2). */
  q: string | null
}

type Query = Record<string, string | string[] | undefined>

const all = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

const ints = (value: string | string[] | undefined, ok: (n: number) => boolean) =>
  [...new Set(all(value).map(Number).filter((n) => Number.isInteger(n) && ok(n)))]

/** The filter a journal URL names. A value it cannot read is no filter, never an empty list. */
export function parseJournalFilter(query: Query): JournalFilter {
  const q = all(query.q)[0]?.trim().slice(0, 80)
  return {
    areaIds: ints(query.pref, (n) => n > 0 && n <= 47),
    stars: ints(query.stars, (n) => n >= 1 && n <= 5),
    grades: [...new Set(all(query.grade).flatMap((g) => (ScanGradeSchema.safeParse(g).success ? [g as ScanGrade] : [])))],
    styles: [...new Set(all(query.style).map((s) => s.trim().slice(0, 24)).filter(Boolean))],
    breweries: ints(query.brewery, (n) => n > 0),
    months: [...new Set(all(query.month).filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)))],
    q: q ? q : null,
  }
}

/** The filter as a `/collection` query, Journal segment included. Repeated keys carry "any of". */
export function journalFilterQuery(filter: JournalFilter): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = { tab: 'journal' }
  const put = (key: string, values: readonly (string | number)[]) => {
    if (values.length > 0) query[key] = values.map(String)
  }
  put('pref', filter.areaIds)
  put('stars', filter.stars)
  put('grade', filter.grades)
  put('style', filter.styles)
  put('brewery', filter.breweries)
  put('month', filter.months)
  if (filter.q) query.q = filter.q
  return query
}

export function withJournalFilter(filter: JournalFilter, patch: Partial<JournalFilter>): JournalFilter {
  return { ...filter, ...patch }
}

type ListKey = Exclude<keyof JournalFilter, 'q'>

const same = (key: ListKey, a: unknown, b: unknown) =>
  key === 'styles' ? String(a).toLocaleLowerCase() === String(b).toLocaleLowerCase() : a === b

/** Whether one chip's "any of" already holds `value`. */
export function hasValue<K extends ListKey>(filter: JournalFilter, key: K, value: JournalFilter[K][number]): boolean {
  return (filter[key] as readonly unknown[]).some((v) => same(key, v, value))
}

/** The filter with `value` added to or taken out of one chip's "any of". */
export function toggleValue<K extends ListKey>(filter: JournalFilter, key: K, value: JournalFilter[K][number]): JournalFilter {
  const list = filter[key] as readonly unknown[]
  const next = hasValue(filter, key, value) ? list.filter((v) => !same(key, v, value)) : [...list, value]
  return { ...filter, [key]: next }
}

export function isFiltered(filter: JournalFilter): boolean {
  return (
    filter.q !== null ||
    (['areaIds', 'stars', 'grades', 'styles', 'breweries', 'months'] as const).some((k) => filter[k].length > 0)
  )
}

export function ratingOfEntry(entry: JournalEntry): number | null {
  return entry.event.kind === 'rating' ? entry.event.rating : null
}

/** The star band a rating falls in: 5, or the whole stars below it (½ joins 1). */
export function starBand(rating: number): number {
  return rating >= 5 ? 5 : Math.max(1, Math.floor(rating))
}

export function monthOf(triedAt: number): string {
  return new Date(triedAt).toISOString().slice(0, 7)
}

function matchesText(entry: JournalEntry, facts: EntryFacts, q: string): boolean {
  const needle = q.toLocaleLowerCase()
  return [
    entry.sake.nameRomaji,
    entry.sake.nameKanji,
    entry.expression?.name,
    facts.brewery?.nameRomaji,
    facts.brewery?.nameKanji,
    entry.notes,
  ].some((text) => text?.toLocaleLowerCase().includes(needle))
}

function keeps(entry: JournalEntry, facts: EntryFacts, filter: JournalFilter): boolean {
  const rating = ratingOfEntry(entry)
  if (filter.areaIds.length && (facts.areaId === null || !filter.areaIds.includes(facts.areaId))) return false
  if (filter.stars.length && (rating === null || !filter.stars.includes(starBand(rating)))) return false
  if (filter.grades.length && (facts.grade === null || !filter.grades.includes(facts.grade))) return false
  if (filter.styles.length) {
    const own = facts.styles.map((s) => s.toLocaleLowerCase())
    if (!filter.styles.some((s) => own.includes(s.toLocaleLowerCase()))) return false
  }
  if (filter.breweries.length && (!facts.brewery || !filter.breweries.includes(facts.brewery.id))) return false
  if (filter.months.length && !filter.months.includes(monthOf(entry.triedAt))) return false
  if (filter.q && !matchesText(entry, facts, filter.q)) return false
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

export type BreweryFacet = { id: number; nameKanji: string; nameRomaji: string | null }

export interface JournalFacets {
  prefectures: Facet<number>[]
  stars: Facet<number>[]
  grades: Facet<ScanGrade>[]
  /** Spelled as first seen; counted without case. */
  styles: Facet<string>[]
  breweries: Facet<BreweryFacet>[]
  /** Newest month first. */
  months: Facet<string>[]
  /** Tastings that name no grade: a grade filter leaves them out (W3). */
  noGrade: number
}

/** Count over the entries: most common first, ties in order of first appearance. */
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
  const rows = entries.map((entry) => ({ entry, facts: factsOf(entry) }))
  return {
    prefectures: tally(rows.map(({ facts }) => facts.areaId).filter((a): a is number => a !== null)),
    stars: tally(
      rows.map(({ entry }) => ratingOfEntry(entry)).filter((r): r is number => r !== null).map(starBand),
    ).sort((a, b) => b.value - a.value),
    grades: tally(rows.map(({ facts }) => facts.grade).filter((g): g is ScanGrade => g !== null)),
    styles: tally(
      rows.flatMap(({ facts }) => [...new Map(facts.styles.map((s) => [s.toLocaleLowerCase(), s])).values()]),
      (style) => style.toLocaleLowerCase(),
    ),
    breweries: tally(
      rows.flatMap(({ facts }) => (facts.brewery ? [facts.brewery] : [])),
      (brewery) => String(brewery.id),
    ),
    months: tally(rows.map(({ entry }) => monthOf(entry.triedAt))).sort((a, b) => (a.value < b.value ? 1 : -1)),
    noGrade: rows.filter(({ facts }) => facts.grade === null).length,
  }
}

/**
 * The facets as the chips offer them while a filter is set: each chip counts
 * the tastings its values would leave with the *other* filters applied (W1:
 * "counts are faceted"), so a number is always what tapping it shows.
 */
export function journalFacetsUnder(
  entries: readonly JournalEntry[],
  factsOf: (entry: JournalEntry) => EntryFacts,
  filter: JournalFilter,
): JournalFacets {
  const without = (patch: Partial<JournalFilter>) =>
    journalFacets(filterJournal(entries, factsOf, withJournalFilter(filter, patch)), factsOf)
  const grades = without({ grades: [] })
  return {
    prefectures: without({ areaIds: [] }).prefectures,
    stars: without({ stars: [] }).stars,
    grades: grades.grades,
    noGrade: grades.noGrade,
    styles: without({ styles: [] }).styles,
    breweries: without({ breweries: [] }).breweries,
    months: without({ months: [] }).months,
  }
}
