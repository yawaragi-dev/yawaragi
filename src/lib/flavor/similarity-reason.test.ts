import { describe, expect, it } from 'vitest'
import { describeFlavorDifference, similarityPercent } from './similarity-reason'
import type { FlavorAxes } from './flavor-similarity'

// §6 shows each row with "{n}% similar" and a one-line reason built from the
// axis differences — "Just as rich and dry, less floral." This module decides
// *which axes* go in that sentence and what the percentage is. It deliberately
// stops short of composing the sentence: the wording is i18n's job (German
// needs its own phrasing), and keeping this layer locale-free means these
// tests pin the arithmetic rather than a translation.

const flat = (v: number): FlavorAxes => ({ f1: v, f2: v, f3: v, f4: v, f5: v, f6: v })

describe('similarityPercent', () => {
  it('is 100% only for an identical profile', () => {
    expect(similarityPercent(0)).toBe(100)
    expect(similarityPercent(0.01)).toBeLessThan(100)
  })

  it('stays inside 0–100 for any input, including nonsense', () => {
    for (const d of [Math.sqrt(6), 99, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const percent = similarityPercent(d)
      expect(percent).toBeGreaterThanOrEqual(0)
      expect(percent).toBeLessThanOrEqual(100)
    }
  })

  it('separates real neighbours instead of pinning them all at 99%', () => {
    // The bug this scale exists to fix. Nearest neighbours in the real
    // catalogue sit roughly 0.02–0.05 apart. Measured against the 6-cube
    // diagonal (2.449) that whole range renders as 98–99%, so every row on the
    // page showed the same number and §6's "accent tag at ≥95" fired on all of
    // them. Verified against live data before the scale changed.
    const nearest = similarityPercent(0.02)
    const fifth = similarityPercent(0.05)

    expect(nearest).toBeGreaterThan(fifth)
    expect(nearest - fifth).toBeGreaterThanOrEqual(2)
  })

  it('reserves the accent band for genuinely near-identical profiles', () => {
    // §6 colours the tag at ≥95. That only means something if a merely-close
    // match falls below it.
    expect(similarityPercent(0.02)).toBeGreaterThanOrEqual(95)
    expect(similarityPercent(0.1)).toBeLessThan(95)
  })

  it('falls as distance grows, and is a whole number', () => {
    const near = similarityPercent(0.1)
    const far = similarityPercent(0.8)
    expect(near).toBeGreaterThan(far)
    expect(Number.isInteger(near)).toBe(true)
    expect(Number.isInteger(far)).toBe(true)
  })
})

describe('describeFlavorDifference', () => {
  it('reports every axis as shared when the profiles match', () => {
    const result = describeFlavorDifference(flat(0.5), flat(0.5))

    // Only two are named: a sentence listing six axes is not a one-liner.
    expect(result.sharedAxes).toEqual(['f1', 'f2'])
    expect(result.divergentAxis).toBeNull()
  })

  it('names the single most divergent axis, and which way it goes', () => {
    const target = flat(0.5)
    // f3 is far higher on the candidate; f6 is mildly lower.
    const candidate = { ...flat(0.5), f3: 0.9, f6: 0.42 }

    const result = describeFlavorDifference(target, candidate)

    expect(result.divergentAxis).toEqual({ axis: 'f3', direction: 'more' })
    // f6's 0.08 gap is within the "just as" band, so it is not the headline.
    expect(result.sharedAxes).not.toContain('f3')
  })

  it('says "less" when the candidate sits below the target', () => {
    const result = describeFlavorDifference(flat(0.6), { ...flat(0.6), f1: 0.1 })

    expect(result.divergentAxis).toEqual({ axis: 'f1', direction: 'less' })
  })

  it('picks the closest axes as the shared ones, nearest first', () => {
    const target: FlavorAxes = { f1: 0.5, f2: 0.5, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }
    // f4 is an exact match, f2 is off by 0.01, f5 by 0.05 — and f3 diverges.
    const candidate: FlavorAxes = { f1: 0.57, f2: 0.51, f3: 0.95, f4: 0.5, f5: 0.45, f6: 0.58 }

    const result = describeFlavorDifference(target, candidate)

    expect(result.sharedAxes).toEqual(['f4', 'f2'])
    expect(result.divergentAxis).toEqual({ axis: 'f3', direction: 'more' })
  })

  it('is deterministic on ties, breaking by axis order', () => {
    // f1 and f2 are equally far; f1 wins because the axes have a canonical
    // order (f1..f6) and the same inputs must always produce the same row.
    const result = describeFlavorDifference(flat(0.5), { ...flat(0.5), f1: 0.9, f2: 0.9 })

    expect(result.divergentAxis).toEqual({ axis: 'f1', direction: 'more' })
  })

  it('reports nothing shared when every axis diverges', () => {
    const result = describeFlavorDifference(flat(0.1), flat(0.9))

    expect(result.sharedAxes).toEqual([])
    expect(result.divergentAxis).not.toBeNull()
  })
})
