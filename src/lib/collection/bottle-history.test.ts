import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  eventsForCellarAction,
  recordBottleEvents,
  seedEvents,
} from '@/lib/collection/bottle-history'
import {
  addBottles,
  applyCellarChange,
  editRow,
  finishOne,
  newCellarRow,
  openOne,
  removeOne,
} from '@/lib/collection/cellar'
import { InMemoryBottleHistoryStore } from '@/lib/collection/in-memory-record-store'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'

const JIKON = { brandId: 7, nameKanji: '而今', nameRomaji: 'Jikon' }
const BOTTLE = { sizeMl: 720, nama: false } as const
const ids = () => {
  let i = 0
  return () => `id${++i}`
}

/** Run a cellar rule and return the events it leaves. */
function eventsOf(
  action: Parameters<typeof eventsForCellarAction>[0],
  rows: CellarBottle[],
  change: ReturnType<typeof openOne>,
  subject: CellarBottle,
) {
  return eventsForCellarAction(action, rows, applyCellarChange(rows, change), subject, 50, ids())
}

describe('what a cellar action leaves in the bottle history', () => {
  const two = newCellarRow(JIKON, BOTTLE, 2, 10)

  it('records the bottles added, dated and with their size and kind', () => {
    const change = addBottles([two], JIKON, { sizeMl: 1800, nama: true }, 3, 50)
    const added = newCellarRow(JIKON, { sizeMl: 1800, nama: true }, 3, 50)
    expect(eventsOf('add', [two], change, added)).toEqual([
      {
        schemaVersion: 1,
        id: 'id1',
        at: 50,
        kind: 'added',
        count: 3,
        thing: { brandId: 7 },
        sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
        sizeMl: 1800,
        nama: true,
      },
    ])
  })

  it('records only the bottles that fit when the row is already full', () => {
    const full = newCellarRow(JIKON, BOTTLE, 98, 10)
    const change = addBottles([full], JIKON, BOTTLE, 5, 50)
    expect(eventsOf('add', [full], change, full).map((e) => e.count)).toEqual([1])
  })

  it('records an opened bottle, then a finished one', () => {
    const opened = openOne([two], '7|720|s', 50)
    expect(eventsOf('open', [two], opened, two).map((e) => [e.kind, e.count])).toEqual([['opened', 1]])

    const after = applyCellarChange([two], opened)
    const open = after.find((r) => r.openedAt !== null)!
    const finished = finishOne(after, '7|720|s|open', 60)
    expect(eventsOf('finish', after, finished, open).map((e) => [e.kind, e.count])).toEqual([['finished', 1]])
  })

  it('records a removed bottle', () => {
    expect(eventsOf('remove', [two], removeOne([two], '7|720|s', 50), two).map((e) => e.kind)).toEqual(['removed'])
  })

  it('records nothing for a tap that changed nothing', () => {
    // "Finished" on a sealed row is a no-op in the rules.
    expect(eventsOf('finish', [two], finishOne([two], '7|720|s', 50), two)).toEqual([])
  })

  it('records an edited count as bottles added or removed, and a new size alone as nothing', () => {
    const up = editRow([two], '7|720|s', { ...BOTTLE, count: 5 }, 50)
    expect(eventsOf('edit', [two], up, two).map((e) => [e.kind, e.count])).toEqual([['added', 3]])

    const down = editRow([two], '7|720|s', { ...BOTTLE, count: 1 }, 50)
    expect(eventsOf('edit', [two], down, two).map((e) => [e.kind, e.count])).toEqual([['removed', 1]])

    const resized = editRow([two], '7|720|s', { sizeMl: 300, nama: true, count: 2 }, 50)
    expect(eventsOf('edit', [two], resized, two)).toEqual([])
  })

  it('names the bottling when the bottles are of one', () => {
    const own = newCellarRow(
      { brandId: null, nameKanji: '富久千代', nameRomaji: null, expression: { id: 'x1', name: '富久千代' } },
      BOTTLE,
      1,
      10,
    )
    const change = removeOne([own], 'x:x1|720|s', 50)
    expect(eventsOf('remove', [own], change, own)[0]!.thing).toEqual({
      brandId: null,
      expression: { id: 'x1', name: '富久千代' },
    })
  })
})

describe('starting the history from the cellar as it is', () => {
  it('seeds one added event per row, at the row\'s date, with a stable id', () => {
    const sealed = newCellarRow(JIKON, BOTTLE, 2, 10)
    const open = { ...newCellarRow(JIKON, BOTTLE, 1, 5), openedAt: 20 }
    expect(seedEvents([sealed, open]).map((e) => [e.id, e.kind, e.count, e.at, e.seeded])).toEqual([
      ['seed:7|720|s', 'added', 2, 10, true],
      ['seed:7|720|s|open', 'added', 1, 5, true],
    ])
  })
})

describe('writing a cellar action into the history', () => {
  afterEach(() => vi.restoreAllMocks())
  const before = [newCellarRow(JIKON, BOTTLE, 2, 10)]
  const finished = eventsForCellarAction(
    'remove',
    before,
    applyCellarChange(before, removeOne(before, '7|720|s', 50)),
    before[0]!,
    50,
    ids(),
  )

  it('counts the bottles already in the cellar the first time anything is written', async () => {
    const history = new InMemoryBottleHistoryStore()
    await recordBottleEvents({ userId: 'u', history }, before, finished)
    expect((await history.read('u')).map((e) => [e.kind, e.count, e.seeded ?? false])).toEqual([
      ['added', 2, true],
      ['removed', 1, false],
    ])
  })

  it('does not seed again once the history has begun', async () => {
    const history = new InMemoryBottleHistoryStore()
    await recordBottleEvents({ userId: 'u', history }, before, finished)
    const next = eventsForCellarAction('add', [], before, before[0]!, 60, () => 'later')
    await recordBottleEvents({ userId: 'u', history }, before, next)
    expect((await history.read('u')).filter((e) => e.seeded)).toHaveLength(1)
    expect(await history.size('u')).toBe(3)
  })

  it('never throws when the history cannot be written, and says so in the log', async () => {
    const history = new InMemoryBottleHistoryStore()
    history.failWrites = true
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordBottleEvents({ userId: 'u', history }, before, finished)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith('[yawaragi:failure]', expect.stringContaining('bottle history'))
    // No user id in the log line (ADR-0009).
    expect(String(log.mock.calls[0]?.[1])).not.toContain('"u"')
  })

  it('records nothing without a store, or with nothing to record', async () => {
    const history = new InMemoryBottleHistoryStore()
    await recordBottleEvents({ userId: 'u', history: null }, before, finished)
    await recordBottleEvents({ userId: 'u', history }, before, [])
    expect(await history.size('u')).toBe(0)
  })
})
