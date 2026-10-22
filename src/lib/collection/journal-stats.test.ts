import { describe, expect, it } from 'vitest'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import type { EntryFacts } from './journal-filter'
import { JOURNAL_NUMBERS_FROM, journalNumbers, journalSurprise } from './journal-stats'

const flat = (v = 0.5): FlavorProfile => ({ f1: v, f2: v, f3: v, f4: v, f5: v, f6: v })

function entry(id: string, rating: number, brandId: number | null, target: FlavorProfile | null = null): JournalEntry {
  return {
    schemaVersion: 3,
    id,
    event: { kind: 'rating', rating, brandId, target, occurredAt: 1 },
    sake: { nameKanji: '酒', nameRomaji: null },
    ...(brandId === null ? { expression: { id: `x-${id}`, name: 'Own' } } : {}),
    triedAt: 1,
    createdAt: 1,
  } as JournalEntry
}

const KUBOTA = { id: 10, nameKanji: '朝日酒造', nameRomaji: 'Asahi Shuzo' }
const NADA = { id: 20, nameKanji: '白鶴酒造', nameRomaji: 'Hakutsuru' }
const base = { styles: [], koji: null }
const facts: Record<string, EntryFacts> = {
  a: { ...base, areaId: 15, brewery: KUBOTA, grade: 'junmai_ginjo' },
  b: { ...base, areaId: 15, brewery: KUBOTA, grade: null },
  c: { ...base, areaId: 15, brewery: NADA, grade: 'junmai' },
  d: { ...base, areaId: 28, brewery: NADA, grade: null },
  e: { ...base, areaId: null, brewery: null, grade: null },
  f: { ...base, areaId: 15, brewery: KUBOTA, grade: null },
}
const factsOf = (e: JournalEntry) => facts[e.id]!
const entries = [entry('a', 5, 1), entry('b', 3, 1), entry('c', 4.5, 2), entry('d', 4.5, 3), entry('e', 5, null), entry('f', 4, 4)]

describe('your journal in numbers', () => {
  it('counts tastings, different sakes, breweries and every prefecture tasted', () => {
    const n = journalNumbers(entries, factsOf)!
    expect([n.tastings, n.sakes, n.breweries]).toEqual([6, 5, 2])
    expect(n.prefectures).toEqual([
      { value: 15, count: 4 },
      { value: 28, count: 1 },
    ])
  })

  it('bands the stars as the journal filter does, and averages them', () => {
    const n = journalNumbers(entries, factsOf)!
    expect(n.stars.spread).toEqual({ 1: 0, 2: 0, 3: 1, 4: 3, 5: 2 })
    expect(n.stars.average).toBe(4.3)
  })

  it('ranks the breweries tasted twice or more by their average, never by how many were tasted', () => {
    const n = journalNumbers(entries, factsOf)!
    expect(n.topBreweries.map((b) => [b.brewery.id, b.average, b.count])).toEqual([
      [20, 4.5, 2],
      [10, 4, 3],
    ])
  })

  it('counts the grades from the tastings that name one', () => {
    const n = journalNumbers(entries, factsOf)!
    expect(n.withGrade).toBe(2)
    expect(n.grades.map((g) => g.value)).toEqual(['junmai_ginjo', 'junmai'])
  })

  it(`says nothing under ${JOURNAL_NUMBERS_FROM} tastings`, () => {
    expect(journalNumbers(entries.slice(0, JOURNAL_NUMBERS_FROM - 1), factsOf)).toBeNull()
  })
})

describe('the surprise', () => {
  const rich: FlavorProfile = { f1: 0.3, f2: 0.6, f3: 0.8, f4: 0.4, f5: 0.3, f6: 0.2 }
  const lightDry: FlavorProfile = { f1: 0.4, f2: 0.3, f3: 0.1, f4: 0.5, f5: 0.9, f6: 0.9 }

  it('is the high rating furthest from the visitor’s palate, with where each leans', () => {
    const s = journalSurprise([entry('x', 4.5, 1, lightDry), entry('y', 5, 2, rich), entry('z', 3, 3, flat(0))], rich)!
    expect(s.entry.id).toBe('x')
    expect(s.rating).toBe(4.5)
    expect([...s.itsLean].sort()).toEqual(['f5', 'f6'])
    expect(s.yourLean).toBe('f3')
  })

  it('is none without a palate, or without a high rating of a charted sake', () => {
    expect(journalSurprise([entry('x', 4.5, 1, lightDry)], null)).toBeNull()
    expect(journalSurprise([entry('x', 3, 1, lightDry), entry('y', 5, null, null)], rich)).toBeNull()
  })
})
