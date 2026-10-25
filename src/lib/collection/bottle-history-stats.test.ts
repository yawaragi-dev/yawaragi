import { describe, expect, it } from 'vitest'
import { type BottleFacts, bottleHistoryStats } from '@/lib/collection/bottle-history-stats'
import type { BottleEvent } from '@/lib/schemas/bottle-event'

let n = 0
const event = (over: Partial<BottleEvent> = {}): BottleEvent => ({
  schemaVersion: 1,
  id: `ev${++n}`,
  at: n,
  kind: 'added',
  count: 1,
  thing: { brandId: 1 },
  sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
  sizeMl: 720,
  nama: false,
  ...over,
})

/** Brand 1 is a ginjo from Mie (24); brand 2 a kimoto junmai from Niigata (15); brand 3 unknown. */
const FACTS: Record<number, BottleFacts> = {
  1: { areaId: 24, grade: 'ginjo', styles: [] },
  2: { areaId: 15, grade: 'junmai', styles: ['Kimoto', 'nama'] },
}
const lookup = (thing: BottleEvent['thing']) => (thing.brandId === null ? null : FACTS[thing.brandId] ?? null)

describe('what you bought', () => {
  it('counts every bottle ever added, including the ones since finished or removed', () => {
    const stats = bottleHistoryStats([
      event({ count: 3 }),
      event({ kind: 'opened' }),
      event({ kind: 'finished' }),
      event({ kind: 'removed' }),
      event({ count: 2, seeded: true }),
    ])
    expect(stats.bottlesAdded).toBe(5)
  })

  it('says what share of the bottles bought was each grade', () => {
    const stats = bottleHistoryStats(
      [event({ count: 9 }), event({ thing: { brandId: 2 } }), event({ thing: { brandId: 3 } })],
      lookup,
    )
    expect(stats.bottlesAdded).toBe(11)
    expect(stats.byGrade.shares).toEqual([
      { key: 'ginjo', bottles: 9, share: 9 / 11 },
      { key: 'junmai', bottles: 1, share: 1 / 11 },
    ])
    expect(stats.byGrade.unknown).toBe(1)
  })

  it('counts a bottle once under each of its styles, whatever their case', () => {
    const stats = bottleHistoryStats(
      [event({ thing: { brandId: 2 }, count: 2 }), event()],
      lookup,
    )
    expect(stats.byStyle.shares).toEqual([
      { key: 'kimoto', bottles: 2, share: 2 / 3 },
      { key: 'nama', bottles: 2, share: 2 / 3 },
    ])
    expect(stats.byStyle.unknown).toBe(1)
  })

  it('shares bottles out by prefecture and by size', () => {
    const stats = bottleHistoryStats(
      [
        event({ sizeMl: 1800 }),
        event({ thing: { brandId: 2 }, sizeMl: 720, count: 2 }),
        event({ thing: { brandId: null, expression: { id: 'x', name: '富久千代' } }, sizeMl: null }),
      ],
      lookup,
    )
    expect(stats.byPrefecture.shares.map((s) => [s.key, s.bottles])).toEqual([
      [15, 2],
      [24, 1],
    ])
    expect(stats.byPrefecture.unknown).toBe(1)
    expect(stats.bySize.shares.map((s) => [s.key, s.bottles])).toEqual([
      [720, 2],
      [1800, 1],
    ])
    expect(stats.bySize.unknown).toBe(1)
  })

  it('says what share of the bottles were nama', () => {
    const stats = bottleHistoryStats([event({ nama: true }), event(), event(), event({ nama: true })])
    expect(stats.nama).toEqual({ bottles: 2, share: 0.5 })
  })

  it('has nothing to say about an empty history, and divides by nothing', () => {
    const stats = bottleHistoryStats([event({ kind: 'finished' })])
    expect(stats.bottlesAdded).toBe(0)
    expect(stats.byGrade).toEqual({ shares: [], unknown: 0 })
    expect(stats.nama).toEqual({ bottles: 0, share: 0 })
  })
})
