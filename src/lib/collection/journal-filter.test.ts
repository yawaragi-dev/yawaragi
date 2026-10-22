import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import {
  type EntryFacts,
  filterJournal,
  journalFacets,
  journalFacetsUnder,
  journalFilterQuery,
  parseJournalFilter,
  starBand,
  toggleValue,
} from './journal-filter'

function entry(id: string, rating: number, brandId: number | null, extra: Partial<JournalEntry> = {}): JournalEntry {
  return {
    schemaVersion: 3,
    id,
    event: { kind: 'rating', rating, brandId, target: null, occurredAt: 1 },
    sake: { nameKanji: '酒', nameRomaji: `Sake ${id}` },
    ...(brandId === null ? { expression: { id: `x-${id}`, name: 'Own' } } : {}),
    triedAt: Date.UTC(2026, 8, 20),
    createdAt: 1,
    ...extra,
  } as JournalEntry
}

const NIIGATA = 15
const HYOGO = 28
const ASAHI = { id: 10, nameKanji: '朝日酒造', nameRomaji: 'Asahi Shuzo' }
const facts: Record<string, EntryFacts> = {
  a: { areaId: NIIGATA, grade: 'junmai_ginjo', styles: ['Nama'], koji: null, brewery: ASAHI },
  b: { areaId: NIIGATA, grade: null, styles: [], koji: null, brewery: ASAHI },
  c: { areaId: HYOGO, grade: 'junmai_ginjo', styles: ['Kimoto', 'nama'], koji: 'white', brewery: null },
  d: { areaId: null, grade: null, styles: [], koji: null, brewery: null },
}
const entries = [
  entry('a', 5, 1, { notes: 'Melon and steamed rice' }),
  entry('b', 3.5, 2, { triedAt: Date.UTC(2026, 7, 2) }),
  entry('c', 4.5, 3),
  entry('d', 4, null),
]
const factsOf = (e: JournalEntry) => facts[e.id]!
const ids = (list: JournalEntry[]) => list.map((e) => e.id)

describe('filtering the journal', () => {
  it('keeps every tasting with no filter set', () => {
    expect(ids(filterJournal(entries, factsOf, parseJournalFilter({})))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reads several values in one chip as "any of", and chips together as "all of"', () => {
    expect(ids(filterJournal(entries, factsOf, parseJournalFilter({ pref: ['15', '28'] })))).toEqual(['a', 'b', 'c'])
    expect(ids(filterJournal(entries, factsOf, parseJournalFilter({ pref: ['15', '28'], stars: '4' })))).toEqual(['c'])
  })

  it('bands the stars: 4 and 4.5 are "4–4.5 stars", 5 is "5 stars"', () => {
    expect([5, 4.5, 4, 3.5, 1, 0.5].map(starBand)).toEqual([5, 4, 4, 3, 1, 1])
    expect(ids(filterJournal(entries, factsOf, parseJournalFilter({ stars: '4' })))).toEqual(['c', 'd'])
  })

  it('finds a word in a name, a brewery or a note, whatever its case', () => {
    expect(ids(filterJournal(entries, factsOf, parseJournalFilter({ q: 'MELON' })))).toEqual(['a'])
    expect(ids(filterJournal(entries, factsOf, parseJournalFilter({ q: 'asahi' })))).toEqual(['a', 'b'])
  })

  it('filters by style words without case, by brewery and by month', () => {
    expect(ids(filterJournal(entries, factsOf, parseJournalFilter({ style: 'NAMA' })))).toEqual(['a', 'c'])
    expect(ids(filterJournal(entries, factsOf, parseJournalFilter({ brewery: '10' })))).toEqual(['a', 'b'])
    expect(ids(filterJournal(entries, factsOf, parseJournalFilter({ month: '2026-08' })))).toEqual(['b'])
  })

  it('ignores values it cannot read, rather than emptying the list', () => {
    expect(parseJournalFilter({ pref: 'tokyo', stars: '9', grade: 'nonsense', month: '2026-13', q: '  ' })).toEqual(
      parseJournalFilter({}),
    )
  })
})

describe('what the chips offer', () => {
  it('offers only values that occur, with counts, and says how many tastings name no grade', () => {
    const facets = journalFacets(entries, factsOf)
    expect(facets.prefectures).toEqual([
      { value: NIIGATA, count: 2 },
      { value: HYOGO, count: 1 },
    ])
    expect(facets.stars).toEqual([
      { value: 5, count: 1 },
      { value: 4, count: 2 },
      { value: 3, count: 1 },
    ])
    expect(facets.breweries).toEqual([{ value: ASAHI, count: 2 }])
    expect(facets.months).toEqual([
      { value: '2026-09', count: 3 },
      { value: '2026-08', count: 1 },
    ])
    expect(facets.noGrade).toBe(2)
  })

  it('counts each chip with the other filters on, keeping its own alternatives', () => {
    const facets = journalFacetsUnder(entries, factsOf, parseJournalFilter({ pref: '15', stars: '5' }))
    expect(facets.prefectures).toEqual([{ value: NIIGATA, count: 1 }])
    expect(facets.stars).toEqual([
      { value: 5, count: 1 },
      { value: 3, count: 1 },
    ])
  })
})

describe('the filter in the address', () => {
  it('round-trips, and a tap adds or takes away one value', () => {
    const filter = parseJournalFilter({ pref: ['15', '28'], stars: '5', style: 'Nama', q: 'melon' })
    expect(parseJournalFilter(journalFilterQuery(filter))).toEqual(filter)
    expect(journalFilterQuery(toggleValue(filter, 'areaIds', 28))).toEqual({
      tab: 'journal',
      pref: ['15'],
      stars: ['5'],
      style: ['Nama'],
      q: 'melon',
    })
    expect(toggleValue(filter, 'styles', 'nama').styles).toEqual([])
  })
})
