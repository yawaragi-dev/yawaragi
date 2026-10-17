import { describe, expect, it } from 'vitest'
import { PAIRING_ROWS } from './pairing-table'
import { resolvePairing, stylesFromWords, type AxisStats } from './resolve-pairing'

// The catalogue's mean and spread per axis as mirrored on 2026-10-17.
const STATS: AxisStats = {
  mean: { f1: 0.33, f2: 0.54, f3: 0.33, f4: 0.39, f5: 0.31, f6: 0.41 },
  sd: { f1: 0.11, f2: 0.08, f3: 0.12, f4: 0.1, f5: 0.11, f6: 0.11 },
}
const chart = (f1: number, f2: number, f3: number, f4: number, f5: number, f6: number) => ({ f1, f2, f3, f4, f5, f6 })

// Real Sakenowa charts of sakes the Sake Service Institute's types are usually illustrated with.
const DASSAI = chart(0.5, 0.52, 0.25, 0.4, 0.21, 0.46)
const DAISHICHI = chart(0.16, 0.66, 0.47, 0.45, 0.21, 0.27)
const SUIGEI = chart(0.3, 0.43, 0.25, 0.35, 0.53, 0.51)
const YUKI_NO_BOSHA = chart(0.38, 0.59, 0.27, 0.46, 0.25, 0.38)

describe('what a sake goes with', () => {
  it('a fragrant sake goes with delicate dishes, from its chart against the catalogue', () => {
    expect(resolvePairing({ chart: DASSAI, stats: STATS })).toMatchObject({ row: { id: 'kunshu' }, source: 'sakenowa_inferred' })
  })

  it('a rich one with simmered and savory dishes', () => {
    expect(resolvePairing({ chart: DAISHICHI, stats: STATS })?.row.id).toBe('junshu')
  })

  it('a dry, light one with clean, fresh dishes', () => {
    expect(resolvePairing({ chart: SUIGEI, stats: STATS })?.row.id).toBe('soshu')
  })

  it('says nothing when no axis clearly leads', () => {
    expect(resolvePairing({ chart: YUKI_NO_BOSHA, stats: STATS })).toBeNull()
  })

  it('a bottling’s style wins over its sake’s chart: an aged sake is not paired as a fragrant one', () => {
    expect(resolvePairing({ styles: ['koshu'], chart: DASSAI, stats: STATS })).toMatchObject({
      row: { id: 'koshu' },
      source: 'manual_curation',
    })
  })

  it('a ginjo grade pairs as a fragrant sake when nothing else is known', () => {
    expect(resolvePairing({ grade: 'junmai_daiginjo' })?.row.id).toBe('kunshu')
  })

  it('a plain junmai, honjozo or futsushu with no chart says nothing: too broad to name a dish', () => {
    for (const grade of ['junmai', 'honjozo', 'futsushu'] as const) expect(resolvePairing({ grade })).toBeNull()
  })

  it('says nothing with no chart, no grade and no style, or without the catalogue figures', () => {
    expect(resolvePairing({})).toBeNull()
    expect(resolvePairing({ chart: DASSAI, stats: null })).toBeNull()
  })

  it('every row names sources and two or three foods', () => {
    for (const row of PAIRING_ROWS) {
      expect(row.sources.length).toBeGreaterThan(0)
      expect(row.foods.length).toBeGreaterThanOrEqual(2)
      expect(row.foods.length).toBeLessThanOrEqual(3)
    }
  })
})

describe('a bottling’s own style words', () => {
  it('are read however they were written: "Kijōshu", "NAMA", "yamahai"', () => {
    expect(stylesFromWords(['Kijōshu', 'NAMA', 'yamahai', 'Hand-picked'])).toEqual(['kijoshu', 'nama', 'yamahai'])
  })
})
