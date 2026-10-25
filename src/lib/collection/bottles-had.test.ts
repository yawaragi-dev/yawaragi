import { describe, expect, it } from 'vitest'
import { bottlesHad, forgetHadBottle } from '@/lib/collection/bottles-had'
import type { BottleEvent } from '@/lib/schemas/bottle-event'

let n = 0
const DAY = 24 * 60 * 60 * 1000
const event = (over: Partial<BottleEvent> = {}): BottleEvent => ({
  schemaVersion: 1,
  id: `ev${++n}`,
  at: n * DAY,
  kind: 'added',
  count: 1,
  thing: { brandId: 1 },
  sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
  sizeMl: 720,
  nama: false,
  ...over,
})

describe('bottles you have had', () => {
  it('lists a finished bottle with the day it was added and the day it was finished', () => {
    const added = event({ at: 1 * DAY })
    const finished = event({ kind: 'finished', at: 9 * DAY })
    expect(bottlesHad([added, event({ kind: 'opened', at: 3 * DAY }), finished])).toEqual([
      expect.objectContaining({ how: 'finished', addedAt: 1 * DAY, endedAt: 9 * DAY, sake: added.sake }),
    ])
  })

  it('lists the most recently finished or removed first, and leaves out bottles still in the cellar', () => {
    const list = bottlesHad([
      event({ count: 3, at: 1 * DAY }),
      event({ kind: 'removed', at: 4 * DAY }),
      event({ kind: 'opened', at: 5 * DAY }),
      event({ kind: 'finished', at: 8 * DAY }),
    ])
    expect(list.map((b) => [b.how, b.endedAt])).toEqual([
      ['finished', 8 * DAY],
      ['removed', 4 * DAY],
    ])
  })

  it('pairs a finished bottle with the bottle of the same size that was opened, not an older sealed one', () => {
    const list = bottlesHad([
      event({ sizeMl: 1800, at: 1 * DAY }),
      event({ sizeMl: 720, at: 5 * DAY }),
      event({ kind: 'opened', sizeMl: 720, at: 6 * DAY }),
      event({ kind: 'finished', sizeMl: 720, at: 9 * DAY }),
    ])
    expect(list).toEqual([expect.objectContaining({ addedAt: 5 * DAY, endedAt: 9 * DAY })])
  })

  it('keeps a bottle of a bottling apart from a bottle of its sake', () => {
    const bottling = { brandId: 1, expression: { id: 'x1', name: 'Jikon Nama' } }
    const list = bottlesHad([
      event({ at: 1 * DAY }),
      event({ at: 2 * DAY, thing: bottling }),
      event({ kind: 'removed', at: 3 * DAY, thing: bottling }),
    ])
    expect(list).toEqual([expect.objectContaining({ addedAt: 2 * DAY, thing: bottling })])
  })

  it('still lists a bottle whose adding the history never saw, with no added date', () => {
    expect(bottlesHad([event({ kind: 'finished', at: 3 * DAY })])).toEqual([
      expect.objectContaining({ addedAt: null, endedAt: 3 * DAY }),
    ])
  })

  it('lists each bottle of a removal of two as a row of its own', () => {
    const list = bottlesHad([event({ count: 2, at: DAY }), event({ kind: 'removed', count: 2, at: 2 * DAY })])
    expect(list).toHaveLength(2)
    expect(new Set(list.map((b) => b.id)).size).toBe(2)
  })
})

describe('taking a bottle off the list', () => {
  it('deletes the lines that were only about that bottle', () => {
    const added = event({ at: DAY })
    const opened = event({ kind: 'opened', at: 2 * DAY })
    const finished = event({ kind: 'finished', at: 3 * DAY })
    const [row] = bottlesHad([added, opened, finished])
    expect(forgetHadBottle([added, opened, finished], row!.id)).toEqual({
      put: [],
      drop: [finished.id, added.id, opened.id],
    })
  })

  it('takes one bottle from a line about several, and the other bottles keep their dates', () => {
    const added = event({ count: 3, at: DAY })
    const removed = event({ kind: 'removed', count: 2, at: 2 * DAY })
    const events = [added, removed]
    const [first, second] = bottlesHad(events)
    const rewrite = forgetHadBottle(events, first!.id)!
    expect(rewrite).toEqual({
      put: [{ ...removed, count: 1 }, { ...added, count: 2 }],
      drop: [],
    })
    const after = events.map((e) => rewrite.put.find((p) => p.id === e.id) ?? e)
    expect(bottlesHad(after)).toEqual([{ ...second!, id: `${removed.id}#0` }])
  })

  it('does nothing for a row that is not on the list', () => {
    expect(forgetHadBottle([event()], 'nope#0')).toBeNull()
  })
})
