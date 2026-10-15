import { describe, expect, it } from 'vitest'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { fitOf, listSimilarity, rankList, strongestAxes, type UnrankedRow } from './rank-list'

const chart = (f1: number, f2: number, f3: number, f4: number, f5: number, f6: number): FlavorChart => ({
  source: 'sakenowa',
  brandId: 1,
  f1,
  f2,
  f3,
  f4,
  f5,
  f6,
})

const RICH_DRY = chart(0.2, 0.5, 0.8, 0.3, 0.75, 0.2)
const FLORAL_LIGHT = chart(0.85, 0.3, 0.2, 0.4, 0.3, 0.8)

let id = 0
const tasting = (brandId: number, rating: number, target: FlavorChart | null, name = `Sake ${brandId}`): JournalEntry => ({
  schemaVersion: 3,
  id: `e${++id}`,
  event: {
    kind: 'rating',
    rating,
    brandId,
    target: target && { f1: target.f1, f2: target.f2, f3: target.f3, f4: target.f4, f5: target.f5, f6: target.f6 },
    occurredAt: id,
  },
  sake: { nameKanji: name, nameRomaji: name },
  triedAt: id,
  createdAt: id,
})

const row = (brandId: number, c: FlavorChart | null, index: number): UnrankedRow => ({
  brandId,
  sakeHref: `/sake/${brandId}`,
  nameKanji: `酒${brandId}`,
  nameRomaji: `Sake ${brandId}`,
  chart: c,
  lines: [{ index, printed: `酒${brandId}`, nameAsPrinted: `酒${brandId}` }],
})

/** A visitor who rates rich, dry sakes highly. */
const RICH_DRY_DRINKER = [
  tasting(100, 5, chart(0.22, 0.5, 0.78, 0.3, 0.74, 0.2), 'Kidoizumi AFS'),
  tasting(101, 4.5, chart(0.25, 0.55, 0.7, 0.35, 0.7, 0.25)),
  tasting(102, 4, chart(0.2, 0.45, 0.75, 0.3, 0.8, 0.2)),
]

describe('the similarity and its words', () => {
  it('reads 1 for the same chart and falls with distance across the cube', () => {
    expect(listSimilarity(RICH_DRY, RICH_DRY)).toBe(1)
    expect(listSimilarity(chart(0, 0, 0, 0, 0, 0), chart(1, 1, 1, 1, 1, 1))).toBeCloseTo(0)
  })

  it('names the fit in the design’s three words at its thresholds', () => {
    expect(fitOf(0.82)).toBe('close')
    expect(fitOf(0.81)).toBe('some')
    expect(fitOf(0.75)).toBe('some')
    expect(fitOf(0.74)).toBe('unusual')
  })

  it('names a chart by its two strongest axes, ties in chart order', () => {
    expect(strongestAxes(RICH_DRY)).toEqual(['f3', 'f5'])
    expect(strongestAxes(chart(0.5, 0.5, 0.5, 0.5, 0.5, 0.5))).toEqual(['f1', 'f2'])
  })
})

describe('ranking a menu for a visitor with a palate', () => {
  it('puts the sake closest to what they rate highly first and the far one last', () => {
    const { rows, ranked } = rankList([row(1, FLORAL_LIGHT, 0), row(2, RICH_DRY, 1)], RICH_DRY_DRINKER, 10)
    expect(ranked).toBe(true)
    expect(rows.map((r) => r.brandId)).toEqual([2, 1])
    expect(rows[0].fit).toBe('close')
    expect(rows[1].fit).toBe('unusual')
  })

  it('explains a close sake by the rated sake it resembles, with the rating given', () => {
    const [first] = rankList([row(2, RICH_DRY, 0)], RICH_DRY_DRINKER, 10).rows
    expect(first.reason).toEqual({ kind: 'like', axes: ['f3', 'f5'], like: { name: 'Kidoizumi AFS', rating: 5 } })
  })

  it('says a far sake is not much like what they rate highly', () => {
    const [first] = rankList([row(1, FLORAL_LIGHT, 0)], RICH_DRY_DRINKER, 10).rows
    expect(first.reason).toEqual({ kind: 'unusual', axes: ['f1', 'f6'] })
  })

  it('gives a sake they have tasted their own rating instead of a comparison', () => {
    const entries = [...RICH_DRY_DRINKER, tasting(1, 3, FLORAL_LIGHT)]
    const [first] = rankList([row(1, FLORAL_LIGHT, 0)], entries, 10).rows
    expect(first.reason).toEqual({ kind: 'tasted', rating: 3, axes: ['f1', 'f6'] })
    expect(first.yourRating).toBe(3)
  })

  it('places a sake with no flavor chart after every ranked one, in list order', () => {
    const { rows } = rankList([row(3, null, 0), row(1, FLORAL_LIGHT, 1), row(4, null, 2)], RICH_DRY_DRINKER, 10)
    expect(rows.map((r) => r.brandId)).toEqual([1, 3, 4])
    expect(rows[1]).toMatchObject({ fit: null, reason: { kind: 'no_chart' } })
  })
})

describe('a visitor with fewer than three tastings', () => {
  it('keeps the list in its own order with the axis words alone and no fit', () => {
    const { rows, ranked, tastings } = rankList(
      [row(1, FLORAL_LIGHT, 0), row(2, RICH_DRY, 1)],
      RICH_DRY_DRINKER.slice(0, 2),
      10,
    )
    expect(ranked).toBe(false)
    expect(tastings).toBe(2)
    expect(rows.map((r) => r.brandId)).toEqual([1, 2])
    expect(rows.map((r) => r.fit)).toEqual([null, null])
    expect(rows[1].reason).toEqual({ kind: 'axes', axes: ['f3', 'f5'] })
  })
})
