import { describe, expect, it } from 'vitest'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import {
  PALATE_READ_THRESHOLD,
  compareAxis,
  meanProfile,
  palateConfidence,
  palateLean,
  palateStage,
} from './palate-read'

const profile = (
  f1: number,
  f2: number,
  f3: number,
  f4: number,
  f5: number,
  f6: number,
): FlavorProfile => ({ f1, f2, f3, f4, f5, f6 })

describe('what the Palate is allowed to claim', () => {
  it('claims nothing at zero tastings', () => {
    expect(palateStage(0)).toBe('none')
  })

  it('says it is taking shape at one and two', () => {
    expect(palateStage(1)).toBe('taking_shape')
    expect(palateStage(2)).toBe('taking_shape')
  })

  it('gives a read at three, which is where §12 puts the line', () => {
    expect(PALATE_READ_THRESHOLD).toBe(3)
    expect(palateStage(3)).toBe('read')
    expect(palateStage(40)).toBe('read')
  })

  it('treats a negative count as nothing rather than throwing', () => {
    expect(palateStage(-1)).toBe('none')
  })
})

describe('confidence', () => {
  it('is n/10, so ten tastings is a firm profile', () => {
    expect(palateConfidence(3)).toBeCloseTo(0.3)
    expect(palateConfidence(10)).toBe(1)
  })

  it('never exceeds 1, however many tastings there are', () => {
    // The bar is rendered as a percentage width; past 1 it would overflow its
    // track, and the copy would read "14 of 10".
    expect(palateConfidence(14)).toBe(1)
    expect(palateConfidence(500)).toBe(1)
  })

  it('is zero with nothing rated', () => {
    expect(palateConfidence(0)).toBe(0)
  })
})

describe('the two axes the title names', () => {
  it('names the strongest first and the runner-up second', () => {
    const lean = palateLean(profile(0.2, 0.55, 0.9, 0.1, 0.3, 0.4))
    expect(lean).toEqual({ top: 'f3', second: 'f2' })
  })

  it('breaks a tie on canonical axis order, so the title cannot flicker', () => {
    // Two equal axes must always resolve the same way. A title that swapped
    // between "Floral, …" and "Mellow, …" on reload would read as the app
    // changing its mind about the visitor.
    const lean = palateLean(profile(0.8, 0.8, 0.1, 0.1, 0.1, 0.1))
    expect(lean).toEqual({ top: 'f1', second: 'f2' })
    const reversed = palateLean(profile(0.1, 0.1, 0.1, 0.1, 0.8, 0.8))
    expect(reversed).toEqual({ top: 'f5', second: 'f6' })
  })

  it('still names two axes when every value is identical', () => {
    expect(palateLean(profile(0.5, 0.5, 0.5, 0.5, 0.5, 0.5))).toEqual({
      top: 'f1',
      second: 'f2',
    })
  })
})

describe('reading one axis against the reference', () => {
  it('calls a difference inside ±6 points the same', () => {
    // Without the band every row would say "more" or "less", including the
    // rows that are indistinguishable from the reference — six rows of noise.
    expect(compareAxis(0.5, 0.5)).toBe('same')
    expect(compareAxis(0.55, 0.5)).toBe('same')
    expect(compareAxis(0.45, 0.5)).toBe('same')
  })

  it('calls a difference outside the band what it is', () => {
    expect(compareAxis(0.57, 0.5)).toBe('more')
    expect(compareAxis(0.43, 0.5)).toBe('less')
  })

  it('reads the extremes correctly', () => {
    expect(compareAxis(1, 0)).toBe('more')
    expect(compareAxis(0, 1)).toBe('less')
  })
})

describe('the reference profile', () => {
  it('averages each axis independently', () => {
    const mean = meanProfile([profile(0, 0.2, 0.4, 0.6, 0.8, 1), profile(1, 0.8, 0.6, 0.4, 0.2, 0)])
    expect(mean).toEqual(profile(0.5, 0.5, 0.5, 0.5, 0.5, 0.5))
  })

  it('reports no reference rather than a fabricated one when there is no data', () => {
    // The caller renders the tick only when this is non-null. A zero-filled
    // fallback would draw every tick at the far left and make every axis read
    // "more than most".
    expect(meanProfile([])).toBeNull()
  })
})
