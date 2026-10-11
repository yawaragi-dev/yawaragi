import { describe, expect, it } from 'vitest'
import {
  bottlingHoldings,
  deleteBottlingWrites,
  renameBottlingWrites,
} from '@/lib/collection/bottling-changes'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { Expression } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }
const RIHAKU = { nameKanji: '李白', nameRomaji: 'Rihaku' }

const poet: Expression = {
  schemaVersion: 1,
  id: 'x1',
  own: true,
  brandId: 12,
  line: RIHAKU,
  name: 'Harvest Moon',
  createdAt: 1,
  updatedAt: 1,
}
const unlisted: Expression = {
  schemaVersion: 1,
  id: 'x2',
  own: true,
  brandId: null,
  line: null,
  name: '富久千代',
  brewery: '盛田屋',
  createdAt: 2,
  updatedAt: 2,
}

const tasting = (id: string, of?: Expression): JournalEntry => ({
  schemaVersion: 3,
  id,
  event: {
    kind: 'rating',
    rating: 4,
    brandId: of ? of.brandId : 12,
    target: of && of.brandId === null ? null : TARGET,
    occurredAt: 10,
  },
  sake: of && of.brandId === null ? { nameKanji: of.name, nameRomaji: null } : RIHAKU,
  ...(of ? { expression: { id: of.id, name: of.name } } : {}),
  notes: 'Pear.',
  triedAt: 10,
  createdAt: 10,
})

const bottles = (count: number, of?: Expression, openedAt: number | null = null): CellarBottle => ({
  schemaVersion: 2,
  brandId: of ? of.brandId : 12,
  ...(of ? { expression: { id: of.id, name: of.name } } : {}),
  sake: of && of.brandId === null ? { nameKanji: of.name, nameRomaji: null } : RIHAKU,
  count,
  openedAt,
  addedAt: 5,
  updatedAt: 5,
})

describe('renaming a bottling you added', () => {
  it('carries the new name onto its tastings and its cellar bottles, and nobody else\'s', () => {
    const renamed = { ...poet, name: 'Wandering Poet' }
    const writes = renameBottlingWrites(
      renamed,
      { entries: [tasting('a', poet), tasting('b')], cellar: [bottles(1, poet), bottles(2)] },
      99,
    )
    expect(writes.putEntries.map((e) => [e.id, e.expression?.name, e.sake.nameKanji])).toEqual([
      ['a', 'Wandering Poet', '李白'],
    ])
    expect(writes.putCellar.map((r) => [r.expression?.name, r.count])).toEqual([['Wandering Poet', 1]])
    expect(writes.removeEntryIds).toEqual([])
    expect(writes.removeCellarKeys).toEqual([])
  })

  it('with no sake, the name the journal and cellar print changes too', () => {
    const renamed = { ...unlisted, name: 'Fukuchiyo' }
    const writes = renameBottlingWrites(
      renamed,
      { entries: [tasting('a', unlisted)], cellar: [bottles(1, unlisted)] },
      99,
    )
    expect(writes.putEntries[0]!.sake).toEqual({ nameKanji: 'Fukuchiyo', nameRomaji: null })
    expect(writes.putCellar[0]!.sake).toEqual({ nameKanji: 'Fukuchiyo', nameRomaji: null })
  })
})

describe('deleting a bottling you added', () => {
  it('counts what it touches, for the question it asks first', () => {
    const records = {
      entries: [tasting('a', poet), tasting('b', poet), tasting('c')],
      cellar: [bottles(2, poet), bottles(1)],
    }
    expect(bottlingHoldings(poet, records)).toEqual({ tastings: 2, bottles: 2 })
  })

  it('of a sake: its tastings stay, under the sake, with everything else about them intact', () => {
    const { writes } = deleteBottlingWrites(
      poet,
      { entries: [tasting('a', poet), tasting('b')], cellar: [] },
      99,
    )
    expect(writes.removeEntryIds).toEqual([])
    expect(writes.putEntries).toHaveLength(1)
    const kept = writes.putEntries[0]!
    expect(kept.id).toBe('a')
    expect(kept.expression).toBeUndefined()
    expect(kept).toMatchObject({ sake: RIHAKU, notes: 'Pear.', event: { brandId: 12, rating: 4 } })
  })

  it('of a sake: its bottles join the sake\'s own row', () => {
    const { writes } = deleteBottlingWrites(
      poet,
      { entries: [], cellar: [bottles(1, poet), bottles(2)] },
      99,
    )
    expect(writes.removeCellarKeys).toEqual(['x:x1'])
    expect(writes.putCellar).toHaveLength(1)
    expect(writes.putCellar[0]).toMatchObject({ brandId: 12, count: 3 })
    expect(writes.putCellar[0]!.expression).toBeUndefined()
  })

  it('of a sake with no row of its own yet: the bottles become that row', () => {
    const { writes, undo } = deleteBottlingWrites(
      poet,
      { entries: [], cellar: [bottles(2, poet, 77)] },
      99,
    )
    expect(writes.putCellar[0]).toMatchObject({ brandId: 12, count: 2, openedAt: 77 })
    expect(undo.createdCellarKeys).toEqual(['12'])
  })

  it('keeps one open bottle per row: the sake\'s own stays the open one', () => {
    const { writes } = deleteBottlingWrites(
      poet,
      { entries: [], cellar: [bottles(1, poet, 77), bottles(1, undefined, 33)] },
      99,
    )
    expect(writes.putCellar[0]).toMatchObject({ count: 2, openedAt: 33 })
  })

  it('with no sake: its tastings and bottles go with it', () => {
    const { writes } = deleteBottlingWrites(
      unlisted,
      { entries: [tasting('a', unlisted), tasting('b')], cellar: [bottles(1, unlisted), bottles(2)] },
      99,
    )
    expect(writes.removeEntryIds).toEqual(['a'])
    expect(writes.removeCellarKeys).toEqual(['x:x2'])
    expect(writes.putEntries).toEqual([])
    expect(writes.putCellar).toEqual([])
  })

  it('remembers everything Undo has to put back, exactly as it was', () => {
    const mine = tasting('a', poet)
    const row = bottles(1, poet)
    const sakeRow = bottles(2)
    const { undo } = deleteBottlingWrites(
      poet,
      { entries: [mine, tasting('b')], cellar: [row, sakeRow] },
      99,
    )
    expect(undo.expression).toEqual(poet)
    expect(undo.entries).toEqual([mine])
    // The bottling's row, and the sake's row as it was before bottles joined it.
    expect(undo.cellar).toEqual([row, sakeRow])
    expect(undo.createdCellarKeys).toEqual([])
  })
})
