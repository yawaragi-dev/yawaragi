import { describe, expect, it } from 'vitest'
import { PAIRING_ROWS } from './pairing-table'
import { resolvePairing, stylesFromWords, type AxisStats } from './resolve-pairing'

// The catalogue's mean and spread per axis as mirrored on 2026-10-17.
const STATS: AxisStats = {
  mean: { f1: 0.33, f2: 0.54, f3: 0.33, f4: 0.39, f5: 0.31, f6: 0.41 },
  sd: { f1: 0.11, f2: 0.08, f3: 0.12, f4: 0.1, f5: 0.11, f6: 0.11 },
}
const chart = (f1: number, f2: number, f3: number, f4: number, f5: number, f6: number) => ({ f1, f2, f3, f4, f5, f6 })

// Real Sakenowa charts. The first four were looked at while choosing the
// thresholds; the "held out" ones were not.
const DASSAI = chart(0.5, 0.52, 0.25, 0.4, 0.21, 0.46)
const DAISHICHI = chart(0.16, 0.66, 0.47, 0.45, 0.21, 0.27)
const SUIGEI = chart(0.3, 0.43, 0.25, 0.35, 0.53, 0.51)
const YUKI_NO_BOSHA = chart(0.38, 0.59, 0.27, 0.46, 0.25, 0.38)
const HELD_OUT = {
  hooBiden: chart(0.51, 0.62, 0.23, 0.27, 0.18, 0.44), // fragrant
  kikuhime: chart(0.12, 0.65, 0.59, 0.4, 0.14, 0.19), // rich, yamahai house
  gikyo: chart(0.25, 0.59, 0.45, 0.44, 0.26, 0.35), // rich
  koshiNoKanbai: chart(0.21, 0.43, 0.27, 0.49, 0.51, 0.44), // Niigata tanrei karakuchi: clean, dry
}

describe('what a sake goes with, from its line’s chart against the catalogue', () => {
  it('a fragrant sake goes with delicate dishes', () => {
    expect(resolvePairing({ chart: DASSAI, stats: STATS })).toMatchObject({
      row: { id: 'kunshu' },
      basis: 'chart',
      source: 'sakenowa_inferred',
    })
  })

  it('a rich one with simmered and savory dishes', () => {
    expect(resolvePairing({ chart: DAISHICHI, stats: STATS })?.row.id).toBe('junshu')
  })

  it('a dry, light one with clean, fresh dishes', () => {
    expect(resolvePairing({ chart: SUIGEI, stats: STATS })?.row.id).toBe('soshu')
  })

  it('places sakes it was not tuned on as their usual type', () => {
    expect(resolvePairing({ chart: HELD_OUT.hooBiden, stats: STATS })?.row.id).toBe('kunshu')
    expect(resolvePairing({ chart: HELD_OUT.kikuhime, stats: STATS })?.row.id).toBe('junshu')
    expect(resolvePairing({ chart: HELD_OUT.gikyo, stats: STATS })?.row.id).toBe('junshu')
    expect(resolvePairing({ chart: HELD_OUT.koshiNoKanbai, stats: STATS })?.row.id).toBe('soshu')
  })

  it('a dry sake with more weight than most is not called light', () => {
    // Dry leads clearly, but juko (Rich) sits above the catalogue mean.
    expect(resolvePairing({ chart: chart(0.25, 0.5, 0.4, 0.35, 0.6, 0.4), stats: STATS })).toBeNull()
  })

  it('says nothing when no axis clearly leads, or without the catalogue figures', () => {
    expect(resolvePairing({ chart: YUKI_NO_BOSHA, stats: STATS })).toBeNull()
    expect(resolvePairing({ chart: DASSAI, stats: null })).toBeNull()
    expect(resolvePairing({})).toBeNull()
  })
})

describe('what a bottling goes with, from its own style and grade', () => {
  it('an aged bottling is paired as aged, not as its fragrant line', () => {
    expect(resolvePairing({ styles: ['koshu'], chart: DASSAI, stats: STATS })).toMatchObject({
      row: { id: 'koshu' },
      basis: 'style',
      source: 'manual_curation',
    })
  })

  it('a nama genshu or a muroka nama is not called light and smooth: it says nothing', () => {
    expect(resolvePairing({ styles: ['nama', 'genshu'] })).toBeNull()
    expect(resolvePairing({ styles: ['muroka', 'nama'] })).toBeNull()
  })

  it('a nama on its own pairs as a light, fresh sake', () => {
    expect(resolvePairing({ styles: ['nama'] })?.row.id).toBe('soshu')
  })

  it('a taruzake ginjo is not paired as fragrant: cedar leads it, and no source pairs the style', () => {
    expect(resolvePairing({ styles: ['taruzake'], grade: 'junmai_ginjo', chart: DASSAI, stats: STATS })).toBeNull()
  })

  it('a kimoto or yamahai pairs as rich, whatever its grade', () => {
    expect(resolvePairing({ styles: ['yamahai'], grade: 'junmai_ginjo' })?.row.id).toBe('junshu')
  })

  it('a ginjo grade pairs as fragrant when the chart agrees or says nothing', () => {
    expect(resolvePairing({ grade: 'junmai_daiginjo' })).toMatchObject({ row: { id: 'kunshu' }, basis: 'grade' })
    expect(resolvePairing({ grade: 'junmai_ginjo', chart: DASSAI, stats: STATS })?.row.id).toBe('kunshu')
  })

  it('a ginjo whose line is clearly dry and clean says nothing rather than "fragrant"', () => {
    expect(resolvePairing({ grade: 'junmai_ginjo', chart: HELD_OUT.koshiNoKanbai, stats: STATS })).toBeNull()
  })

  it('a plain junmai, honjozo or futsushu with no chart says nothing: too broad to name a dish', () => {
    for (const grade of ['junmai', 'honjozo', 'futsushu'] as const) expect(resolvePairing({ grade })).toBeNull()
  })
})

describe('the table', () => {
  it('every row names two or three foods and at least two sources, each dated', () => {
    for (const row of PAIRING_ROWS) {
      expect(row.foods.length).toBeGreaterThanOrEqual(2)
      expect(row.foods.length).toBeLessThanOrEqual(3)
      expect(row.sources.length).toBeGreaterThanOrEqual(2)
      for (const source of row.sources) expect(source.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('a bottling’s own style words', () => {
  it('are read however they were written, one word or a phrase', () => {
    expect(stylesFromWords(['Kijōshu', 'NAMA', 'yamahai', 'Hand-picked'])).toEqual(['kijoshu', 'nama', 'yamahai'])
    expect(stylesFromWords(['Muroka Nama Genshu'])).toEqual(['muroka', 'nama', 'genshu'])
  })
})
