import { describe, expect, it } from 'vitest'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { PAIRING_ROWS } from './pairing-table'
import { DISH_GROUPS, bottlesForDish, isDishGroupId, rowsForDish } from './bottles-for-dish'
import type { PairingDeps, PairingSubject } from './pairing-of'
import type { AxisStats } from './resolve-pairing'

const STATS: AxisStats = {
  mean: { f1: 0.33, f2: 0.54, f3: 0.33, f4: 0.39, f5: 0.31, f6: 0.41 },
  sd: { f1: 0.11, f2: 0.08, f3: 0.12, f4: 0.1, f5: 0.11, f6: 0.11 },
}
const CHARTS: Record<number, FlavorProfile> = {
  1: { f1: 0.5, f2: 0.52, f3: 0.25, f4: 0.4, f5: 0.21, f6: 0.46 }, // fragrant
  2: { f1: 0.16, f2: 0.66, f3: 0.47, f4: 0.45, f5: 0.21, f6: 0.27 }, // rich
  3: { f1: 0.3, f2: 0.43, f3: 0.25, f4: 0.35, f5: 0.53, f6: 0.51 }, // dry, light
  4: { f1: 0.38, f2: 0.59, f3: 0.27, f4: 0.46, f5: 0.25, f6: 0.38 }, // no clear lead
}
const deps: PairingDeps = {
  lookupChart: async (brandId) => CHARTS[brandId] ?? null,
  axisStats: async () => STATS,
}

/** A cellar row as a caller would hand it over: its key, and what to read. */
interface Row {
  key: string
  subject: PairingSubject
}
const sake = (key: string, brandId: number, nama = false): Row => ({
  key,
  subject: { kind: 'cellar', bottle: { brandId, nama } },
})
const bottling = (key: string, styles: string[]): Row => ({
  key,
  subject: {
    kind: 'cellar',
    bottle: { brandId: 4, nama: false, expression: { id: key, name: key } },
    expression: { brandId: 4, styles },
  },
})
const pick = (dish: Parameters<typeof bottlesForDish>[0], rows: Row[]) =>
  bottlesForDish(dish, rows, { ...deps, subjectOf: (row) => row.subject })
const keys = (entries: { bottle: Row }[]) => entries.map((entry) => entry.bottle.key)

describe('the dishes a visitor can pick from', () => {
  it('cover every food the pairing table names, each in exactly one dish', () => {
    const tableFoods = new Set(PAIRING_ROWS.flatMap((row) => row.foods))
    const grouped = DISH_GROUPS.flatMap((group) => [...group.foods])
    expect(new Set(grouped)).toEqual(tableFoods)
    expect(grouped).toHaveLength(new Set(grouped).size)
  })

  it('each reach at least one kind of sake, so no dish is a dead end', () => {
    for (const group of DISH_GROUPS) expect(rowsForDish(group.id).length).toBeGreaterThan(0)
  })

  it('reach the kinds whose foods they cover', () => {
    expect(rowsForDish('rawSeafood')).toEqual(['kunshu', 'soshu'])
    expect(rowsForDish('cheese')).toEqual(['kunshu', 'koshu', 'sparkling', 'nigori'])
  })

  it('are recognised by id, and nothing else is', () => {
    expect(isDishGroupId('spicy')).toBe(true)
    expect(isDishGroupId('pizza')).toBe(false)
  })
})

describe('picking a bottle from the cellar for a dish', () => {
  it('puts the bottles that go with the dish first, naming the dish’s foods each one is served with', async () => {
    const result = await pick('rawSeafood', [sake('rich', 2), sake('fragrant', 1), sake('light', 3)])
    expect(keys(result.matches)).toEqual(['fragrant', 'light'])
    expect(result.matches[0].foods).toEqual(['sashimi', 'crab'])
    expect(result.matches[1].foods).toEqual(['oysters'])
    expect(keys(result.others)).toEqual(['rich'])
  })

  it('keeps the cellar’s order within each group, so the bottle to finish first leads', async () => {
    const rows = [sake('open-soon', 3), sake('rich-open', 2), sake('sealed', 1), sake('rich-sealed', 2)]
    const result = await pick('rawSeafood', rows)
    expect(keys(result.matches)).toEqual(['open-soon', 'sealed'])
    expect(keys(result.others)).toEqual(['rich-open', 'rich-sealed'])
  })

  it('carries each bottle’s own pairing, so a style match reads as curated and a chart match as inferred', async () => {
    const result = await pick('cheese', [bottling('aged', ['Koshu']), sake('fragrant', 1)])
    expect(result.matches.map((m) => [m.bottle.key, m.pairing.basis, m.pairing.source])).toEqual([
      ['aged', 'style', 'manual_curation'],
      ['fragrant', 'chart', 'sakenowa_inferred'],
    ])
  })

  it('lists the bottles the table cannot place instead of hiding them', async () => {
    const result = await pick('spicy', [
      sake('no-chart', 99),
      sake('no-lead', 4),
      bottling('genshu', ['Genshu']),
      bottling('cloudy', ['Nigori']),
    ])
    expect(keys(result.matches)).toEqual(['cloudy'])
    expect(keys(result.unplaceable)).toEqual(['no-chart', 'no-lead', 'genshu'])
    expect(result.others).toEqual([])
  })

  it('reads a bottle the visitor marked nama as nama, as its page does', async () => {
    const result = await pick('friedFish', [sake('rich-nama', 2, true)])
    expect(keys(result.matches)).toEqual(['rich-nama'])
  })

  it('with an empty cellar, finds nothing in any group', async () => {
    expect(await pick('sweets', [])).toEqual({ matches: [], others: [], unplaceable: [] })
  })
})
