import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import {
  type EntryFacts,
  filterJournal,
  journalFacets,
  journalFacetsUnder,
  journalFilterQuery,
  parseJournalFilter,
  withJournalFilter,
} from './journal-filter'

function entry(id: string, rating: number, brandId: number | null): JournalEntry {
  return {
    schemaVersion: 3,
    id,
    event: { kind: 'rating', rating, brandId, target: null, occurredAt: 1 },
    sake: { nameKanji: '酒', nameRomaji: null },
    ...(brandId === null ? { expression: { id: `x-${id}`, name: 'Own' } } : {}),
    triedAt: 1,
    createdAt: 1,
  } as JournalEntry
}

const NIIGATA = 15
const HYOGO = 28
const facts: Record<string, EntryFacts> = {
  a: { areaId: NIIGATA, grade: 'junmai_ginjo', styles: ['Nama'], koji: null },
  b: { areaId: NIIGATA, grade: null, styles: [], koji: null },
  c: { areaId: HYOGO, grade: 'junmai_ginjo', styles: ['Kimoto', 'nama'], koji: 'white' },
  d: { areaId: null, grade: null, styles: [], koji: null },
}
const entries = [entry('a', 5, 1), entry('b', 3, 2), entry('c', 5, 3), entry('d', 4, null)]
const factsOf = (e: JournalEntry) => facts[e.id]!

describe('filtering the journal', () => {
  it('keeps every tasting with no filter set', () => {
    expect(filterJournal(entries, factsOf, parseJournalFilter({})).map((e) => e.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('narrows to one prefecture, and to five stars within it', () => {
    expect(filterJournal(entries, factsOf, parseJournalFilter({ pref: '15' })).map((e) => e.id)).toEqual(['a', 'b'])
    expect(filterJournal(entries, factsOf, parseJournalFilter({ pref: '15', stars: '5' })).map((e) => e.id)).toEqual(['a'])
  })

  it('matches a style word whatever its case, as the visitor typed it', () => {
    expect(filterJournal(entries, factsOf, parseJournalFilter({ style: 'NAMA' })).map((e) => e.id)).toEqual(['a', 'c'])
  })

  it('filters by grade and koji, which only bottlings carry', () => {
    expect(filterJournal(entries, factsOf, parseJournalFilter({ grade: 'junmai_ginjo' })).map((e) => e.id)).toEqual(['a', 'c'])
    expect(filterJournal(entries, factsOf, parseJournalFilter({ koji: 'white' })).map((e) => e.id)).toEqual(['c'])
  })

  it('ignores filter values it cannot read, rather than emptying the list', () => {
    expect(parseJournalFilter({ pref: 'tokyo', stars: '9', grade: 'nonsense', koji: 'green' })).toEqual(parseJournalFilter({}))
  })
})

describe('what the journal can be filtered by', () => {
  it('offers only values that occur, with how many tastings each would leave', () => {
    const facets = journalFacets(entries, factsOf)
    expect(facets.prefectures).toEqual([
      { value: NIIGATA, count: 2 },
      { value: HYOGO, count: 1 },
    ])
    expect(facets.stars).toEqual([
      { value: 5, count: 2 },
      { value: 4, count: 1 },
      { value: 3, count: 1 },
    ])
    expect(facets.grades).toEqual([{ value: 'junmai_ginjo', count: 2 }])
    expect(facets.styles).toEqual([
      { value: 'Nama', count: 2 },
      { value: 'Kimoto', count: 1 },
    ])
    expect(facets.koji).toEqual([{ value: 'white', count: 1 }])
  })
})

describe('the chips while a filter is set', () => {
  it('count what each value would leave with the other filters applied, and keep their own alternatives', () => {
    const facets = journalFacetsUnder(entries, factsOf, parseJournalFilter({ pref: '15', stars: '5' }))
    expect(facets.prefectures).toEqual([
      { value: NIIGATA, count: 1 },
      { value: HYOGO, count: 1 },
    ])
    expect(facets.stars).toEqual([
      { value: 5, count: 1 },
      { value: 3, count: 1 },
    ])
  })
})

describe('the filter in the address', () => {
  it('round-trips through the query, and a patch clears one filter without touching the others', () => {
    const filter = parseJournalFilter({ pref: '15', stars: '5', style: 'Nama' })
    expect(parseJournalFilter(journalFilterQuery(filter))).toEqual(filter)
    expect(journalFilterQuery(withJournalFilter(filter, { stars: null }))).toEqual({ tab: 'journal', pref: '15', style: 'Nama' })
  })
})
