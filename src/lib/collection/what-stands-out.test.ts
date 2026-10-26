import { describe, expect, it } from 'vitest'
import type { BottleFacts } from '@/lib/collection/bottle-history-stats'
import type { EntryFacts } from '@/lib/collection/journal-filter'
import { bottlesKept, whatStandsOut } from '@/lib/collection/what-stands-out'
import type { BottleEvent } from '@/lib/schemas/bottle-event'
import type { JournalEntry } from '@/lib/schemas/journal-entry'

let n = 0
/** A tasting of brand `brandId`, rated `rating`. */
const tasting = (brandId: number, rating: number): JournalEntry => ({
  schemaVersion: 3,
  id: `t${++n}`,
  event: { kind: 'rating', rating, brandId, target: null, occurredAt: n },
  sake: { nameKanji: '酒', nameRomaji: null },
  triedAt: n,
  createdAt: n,
})
const added = (brandId: number, count = 1): BottleEvent => ({
  schemaVersion: 1,
  id: `b${++n}`,
  at: n,
  kind: 'added',
  count,
  thing: { brandId },
  sake: { nameKanji: '酒', nameRomaji: null },
  sizeMl: 720,
  nama: false,
})

/**
 * The catalogue as the tests see it, by brand id:
 * 1 — a junmai ginjo from Niigata (15); 2 — a kimoto junmai from Yamagata (6);
 * 3 — a junmai from Akita (5); 4 — nothing known, from Hyōgo (28).
 */
const FACTS: Record<number, EntryFacts> = {
  1: { areaId: 15, grade: 'junmai_ginjo', styles: [], koji: null },
  2: { areaId: 6, grade: 'junmai', styles: ['Kimoto'], koji: null },
  3: { areaId: 5, grade: 'junmai', styles: [], koji: null },
  4: { areaId: 28, grade: null, styles: [], koji: null },
}
const factsOf = (entry: JournalEntry) =>
  FACTS[entry.event.kind === 'rating' ? (entry.event.brandId ?? 0) : 0] ?? {
    areaId: null,
    grade: null,
    styles: [],
    koji: null,
  }
const bottleFactsOf = (thing: BottleEvent['thing']): BottleFacts | null =>
  thing.brandId === null ? null : (FACTS[thing.brandId] ?? null)

const run = (entries: JournalEntry[], events: BottleEvent[] = []) =>
  whatStandsOut({ entries, factsOf, events, bottleFactsOf })

describe('what stands out', () => {
  it('has nothing to say under eight tastings', () => {
    expect(run(Array.from({ length: 7 }, () => tasting(1, 4)))).toBeNull()
  })

  it('says you keep mostly one grade but rate another kind highest, with the counts behind it', () => {
    const entries = [
      ...[4, 4, 3.5].map((r) => tasting(1, r)),
      ...[5, 4.5, 4.5].map((r) => tasting(2, r)),
      tasting(3, 3),
      tasting(4, 3),
    ]
    const events = [added(1, 6), added(2), added(3), added(4, 2)]
    const out = run(entries, events)!
    expect(out.insights[0]).toEqual({
      kind: 'contrast',
      kept: { grade: 'junmai_ginjo', bottles: 6, of: 10 },
      keptAverage: 23 / 6,
      rated: { category: { kind: 'starter', starter: 'kimoto' }, average: 14 / 3, tastings: 3 },
    })
    expect(out).toMatchObject({ tastings: 8, bottles: 10, thin: true })
  })

  it('says what most of the kept bottles are when nothing else is rated higher, and never both', () => {
    const entries = Array.from({ length: 8 }, () => tasting(1, 4))
    const out = run(entries, [added(1, 6), added(3, 2)])!
    expect(out.insights.filter((i) => i.kind === 'contrast' || i.kind === 'share')).toEqual([
      { kind: 'share', grade: 'junmai_ginjo', bottles: 6, of: 8 },
    ])
  })

  it('says nothing about kept bottles under eight bottles, or when no grade clearly leads', () => {
    const entries = Array.from({ length: 8 }, () => tasting(2, 5))
    expect(run(entries, [added(1, 7)])!.insights.map((i) => i.kind)).not.toContain('share')
    expect(run(entries, [added(1, 4), added(3, 4)])!.insights.map((i) => i.kind)).not.toContain('contrast')
  })

  it('names the region most of the highest ratings come from, once there are four of them and three agree', () => {
    // Yamagata (6) and Akita (5) are both Tōhoku.
    const entries = [tasting(2, 5), tasting(2, 4.5), tasting(3, 5), tasting(1, 5), ...Array.from({ length: 4 }, () => tasting(1, 3))]
    expect(run(entries)!.insights).toContainEqual({ kind: 'match', region: 'tohoku', tastings: 3, of: 4 })
    const fewer = [tasting(2, 5), tasting(3, 5), tasting(1, 5), ...Array.from({ length: 5 }, () => tasting(1, 3))]
    expect(run(fewer)!.insights.map((i) => i.kind)).not.toContain('match')
  })

  it('points at the first region Learn describes that no tasting comes from', () => {
    // Niigata (15) is tasted, so the next in line is Hyōgo (28).
    const out = run(Array.from({ length: 8 }, () => tasting(1, 4)))!
    expect(out.insights).toContainEqual({ kind: 'gap', areaId: 28, slug: 'region-hyogo' })
  })

  it('makes no gap up when no tasting has a known prefecture', () => {
    const out = run(Array.from({ length: 8 }, () => tasting(99, 4)))!
    expect(out.insights).toEqual([])
  })

  it('puts the kept-bottles sentence first, then the region, then the place not yet tasted', () => {
    const entries = [tasting(2, 5), tasting(2, 4.5), tasting(3, 5), tasting(1, 5), ...Array.from({ length: 4 }, () => tasting(1, 3))]
    const kinds = run(entries, [added(1, 6), added(3, 2)])!.insights.map((i) => i.kind)
    expect(kinds).toEqual(['contrast', 'match', 'gap'])
  })

  it('stops calling it early from twenty tastings', () => {
    expect(run(Array.from({ length: 20 }, () => tasting(1, 4)))!.thin).toBe(false)
  })
})

describe('bottles you have kept', () => {
  it('shows from five bottles, by grade and by prefecture, four of each at most, each bottle once', () => {
    expect(bottlesKept([added(1, 4)], bottleFactsOf)).toBeNull()
    const kept = bottlesKept([added(1, 3), added(2), added(3, 2), added(4)], bottleFactsOf)!
    expect(kept.bottles).toBe(7)
    expect(kept.grades.map((g) => [g.key, g.bottles])).toEqual([
      ['junmai', 3],
      ['junmai_ginjo', 3],
    ])
    expect(kept.prefectures.map((p) => [p.key, p.bottles])).toEqual([
      [15, 3],
      [5, 2],
      [6, 1],
      [28, 1],
    ])
  })
})
