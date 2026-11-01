import { describe, expect, it, vi } from 'vitest'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { pairingInputs, pairingOf, type PairingDeps } from './pairing-of'
import type { AxisStats } from './resolve-pairing'

// The catalogue's mean and spread per axis as mirrored on 2026-10-17.
const STATS: AxisStats = {
  mean: { f1: 0.33, f2: 0.54, f3: 0.33, f4: 0.39, f5: 0.31, f6: 0.41 },
  sd: { f1: 0.11, f2: 0.08, f3: 0.12, f4: 0.1, f5: 0.11, f6: 0.11 },
}
const DASSAI = 1 // fragrant chart
const DAISHICHI = 2 // rich chart
const SUIGEI = 3 // dry, light chart
const CHARTS: Record<number, FlavorProfile> = {
  [DASSAI]: { f1: 0.5, f2: 0.52, f3: 0.25, f4: 0.4, f5: 0.21, f6: 0.46 },
  [DAISHICHI]: { f1: 0.16, f2: 0.66, f3: 0.47, f4: 0.45, f5: 0.21, f6: 0.27 },
  [SUIGEI]: { f1: 0.3, f2: 0.43, f3: 0.25, f4: 0.35, f5: 0.53, f6: 0.51 },
}

function fakeDeps(): PairingDeps {
  return {
    lookupChart: vi.fn(async (brandId: number) => CHARTS[brandId] ?? null),
    axisStats: vi.fn(async () => STATS),
  }
}

describe('what a catalogue sake goes with', () => {
  it('comes from its chart, and says so', async () => {
    expect(await pairingOf({ kind: 'sake', brandId: DASSAI }, fakeDeps())).toMatchObject({
      row: { id: 'kunshu' },
      basis: 'chart',
      source: 'sakenowa_inferred',
    })
  })

  it('is nothing when the sake has no chart', async () => {
    expect(await pairingOf({ kind: 'sake', brandId: 999 }, fakeDeps())).toBeNull()
  })
})

describe('what an own bottling goes with', () => {
  it('follows a style the visitor typed over the line’s chart, as curated', async () => {
    const pairing = await pairingOf(
      { kind: 'bottling', expression: { brandId: DASSAI, styles: ['Kōshu'] } },
      fakeDeps(),
    )
    expect(pairing).toMatchObject({ row: { id: 'koshu' }, basis: 'style', source: 'manual_curation' })
  })

  it('names a ginjo grade as what picked a fragrant row', async () => {
    const pairing = await pairingOf(
      { kind: 'bottling', expression: { brandId: DASSAI, grade: 'junmai_daiginjo' } },
      fakeDeps(),
    )
    expect(pairing).toMatchObject({ basis: 'grade', grade: 'junmai_daiginjo', source: 'manual_curation' })
  })

  it('falls back to its line’s chart when it says nothing itself', async () => {
    const pairing = await pairingOf({ kind: 'bottling', expression: { brandId: DAISHICHI } }, fakeDeps())
    expect(pairing).toMatchObject({ row: { id: 'junshu' }, basis: 'chart', source: 'sakenowa_inferred' })
  })

  it('with no line in the catalogue, never asks the catalogue', async () => {
    const deps = fakeDeps()
    expect(await pairingOf({ kind: 'bottling', expression: { brandId: null, grade: 'junmai' } }, deps)).toBeNull()
    expect(deps.lookupChart).not.toHaveBeenCalled()
    expect(deps.axisStats).not.toHaveBeenCalled()
  })
})

describe('what a cellar bottle goes with', () => {
  it('a bottle of a sake reads like the sake’s page', async () => {
    const pairing = await pairingOf(
      { kind: 'cellar', bottle: { brandId: SUIGEI, nama: false } },
      fakeDeps(),
    )
    expect(pairing).toMatchObject({ row: { id: 'soshu' }, basis: 'chart' })
  })

  it('a bottle the visitor marked nama is paired as nama, whatever the line’s chart', async () => {
    const pairing = await pairingOf(
      { kind: 'cellar', bottle: { brandId: DAISHICHI, nama: true } },
      fakeDeps(),
    )
    expect(pairing).toMatchObject({ row: { id: 'soshu' }, basis: 'style', source: 'manual_curation' })
  })

  it('a bottle of an own bottling reads like the bottling’s page', async () => {
    const pairing = await pairingOf(
      {
        kind: 'cellar',
        bottle: { brandId: DASSAI, nama: false, expression: { id: 'x1', name: 'Mio' } },
        expression: { brandId: DASSAI, styles: ['Sparkling'] },
      },
      fakeDeps(),
    )
    expect(pairing).toMatchObject({ row: { id: 'sparkling' }, basis: 'style' })
  })

  it('a nama genshu bottle says nothing, rather than reading the line', async () => {
    const pairing = await pairingOf(
      {
        kind: 'cellar',
        bottle: { brandId: DASSAI, nama: true, expression: { id: 'x2', name: 'Genshu' } },
        expression: { brandId: DASSAI, styles: ['Genshu'] },
      },
      fakeDeps(),
    )
    expect(pairing).toBeNull()
  })

  it('a bottle whose bottling was since deleted is read as a bottle of its line', async () => {
    const pairing = await pairingOf(
      {
        kind: 'cellar',
        bottle: { brandId: DAISHICHI, nama: false, expression: { id: 'gone', name: 'Old' } },
        expression: null,
      },
      fakeDeps(),
    )
    expect(pairing).toMatchObject({ row: { id: 'junshu' }, basis: 'chart' })
  })
})

describe('pairingInputs', () => {
  it('adds a cellar row’s nama to the bottling’s own words only once', () => {
    expect(
      pairingInputs({
        kind: 'cellar',
        bottle: { brandId: 5, nama: true, expression: { id: 'x', name: 'n' } },
        expression: { brandId: 5, styles: ['Nama', 'Yamahai'], grade: 'junmai' },
      }),
    ).toEqual({ brandId: 5, styles: ['nama', 'yamahai'], grade: 'junmai' })
  })
})
