import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import type { EntryFacts } from './journal-filter'
import { JOURNAL_NUMBERS_FROM, journalNumbers } from './journal-stats'

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

const KUBOTA = { id: 10, nameKanji: '朝日酒造', nameRomaji: 'Asahi Shuzo' }
const KIKUSUI = { id: 11, nameKanji: '菊水酒造', nameRomaji: null }
const NADA = { id: 20, nameKanji: '白鶴酒造', nameRomaji: 'Hakutsuru' }
const base = { grade: null, styles: [], koji: null }
const facts: Record<string, EntryFacts> = {
  a: { ...base, areaId: 15, brewery: KUBOTA, grade: 'junmai_ginjo' },
  b: { ...base, areaId: 15, brewery: KUBOTA },
  c: { ...base, areaId: 15, brewery: KIKUSUI },
  d: { ...base, areaId: 28, brewery: NADA },
  e: { ...base, areaId: null, brewery: null },
  f: { ...base, areaId: 15, brewery: KUBOTA },
}
const factsOf = (e: JournalEntry) => facts[e.id]!
const entries = [entry('a', 5, 1), entry('b', 3, 1), entry('c', 4, 2), entry('d', 2, 3), entry('e', 5, null), entry('f', 4, 4)]

describe('your journal in numbers', () => {
  it('counts tastings, different sakes, breweries and prefectures', () => {
    const n = journalNumbers(entries, factsOf)!
    expect(n.tastings).toBe(6)
    // a and b are the same sake tasted twice; e is an own bottling.
    expect(n.sakes).toBe(5)
    expect(n.breweries).toBe(3)
    expect(n.prefectures.tasted).toBe(2)
    expect(n.prefectures.top).toEqual([
      { value: 15, count: 4 },
      { value: 28, count: 1 },
    ])
  })

  it('spreads the stars and averages them to one decimal', () => {
    const n = journalNumbers(entries, factsOf)!
    expect(n.stars.spread).toEqual({ 1: 0, 2: 1, 3: 1, 4: 2, 5: 2 })
    expect(n.stars.average).toBe(3.8)
  })

  it('names the breweries returned to — tasted at least twice — with their average stars', () => {
    const n = journalNumbers(entries, factsOf)!
    expect(n.topBreweries).toEqual([{ brewery: KUBOTA, count: 3, average: 4 }])
  })

  it(`says nothing under ${JOURNAL_NUMBERS_FROM} tastings, where numbers would mean little`, () => {
    expect(journalNumbers(entries.slice(0, JOURNAL_NUMBERS_FROM - 1), factsOf)).toBeNull()
  })
})
