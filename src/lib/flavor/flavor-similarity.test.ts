import { describe, expect, it } from 'vitest'
import { type FlavorAxes, findSimilarByFlavor, flavorDistance } from './flavor-similarity'

describe('flavorDistance', () => {
  // A change to the distance formula (e.g. someone swapping L2 for Manhattan)
  // would break every one of these assertions — the test fails on math, not on
  // the choice of a helper. That's the point.

  it('returns 0 for two identical vectors', () => {
    const a = { f1: 0.5, f2: 0.5, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }
    expect(flavorDistance(a, a)).toBe(0)
  })

  it('is symmetric: d(a, b) === d(b, a)', () => {
    const a = { f1: 0.1, f2: 0.2, f3: 0.3, f4: 0.4, f5: 0.5, f6: 0.6 }
    const b = { f1: 0.6, f2: 0.5, f3: 0.4, f4: 0.3, f5: 0.2, f6: 0.1 }
    expect(flavorDistance(a, b)).toBeCloseTo(flavorDistance(b, a), 12)
  })

  it('computes the Euclidean distance between two known-different vectors', () => {
    // Difference vector [0.3, 0.4, 0, 0, 0, 0] → L2 = sqrt(0.09 + 0.16) = 0.5
    const a = { f1: 0.1, f2: 0.2, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }
    const b = { f1: 0.4, f2: 0.6, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }
    expect(flavorDistance(a, b)).toBeCloseTo(0.5, 10)
  })

  it('reaches sqrt(6) for opposite corners of the unit cube', () => {
    // Every axis differs by 1 → L2 = sqrt(6). Sanity-checks the upper bound: a
    // real flavor profile in [0, 1]^6 can never exceed this.
    const zeros = { f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    const ones = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }
    expect(flavorDistance(zeros, ones)).toBeCloseTo(Math.sqrt(6), 10)
  })

  it('gives sqrt(2) for two orthogonal unit vectors', () => {
    // Peaks on different single axes and zero elsewhere → the two "1"s each
    // contribute, L2 = sqrt(1 + 1). Confirms cross-axis differences add in
    // quadrature rather than being ignored (as a cosine metric would here).
    const onF1 = { f1: 1, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    const onF2 = { f1: 0, f2: 1, f3: 0, f4: 0, f5: 0, f6: 0 }
    expect(flavorDistance(onF1, onF2)).toBeCloseTo(Math.sqrt(2), 10)
  })
})

describe('findSimilarByFlavor', () => {
  // Named candidates arranged on the f1 axis at known distances from a target
  // sitting at f1 = 0, so the ranking is verifiable by hand. `id` is an extra
  // field to prove the generic carries the caller's own type through.
  const target: FlavorAxes = { f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
  const axesAt = (f1: number) => ({ f1, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 })
  const near = { id: 'near', ...axesAt(0.1) } // distance 0.1
  const mid = { id: 'mid', ...axesAt(0.4) } // distance 0.4
  const far = { id: 'far', ...axesAt(0.9) } // distance 0.9

  it('ranks candidates by ascending flavor distance', () => {
    const matches = findSimilarByFlavor(target, [far, near, mid])
    expect(matches.map((m) => m.candidate.id)).toEqual(['near', 'mid', 'far'])
    expect(matches[0]!.distance).toBeCloseTo(0.1, 10)
  })

  it('returns every candidate ranked when no limit is given', () => {
    expect(findSimilarByFlavor(target, [far, near, mid])).toHaveLength(3)
  })

  it('honours limit, keeping the nearest N', () => {
    const matches = findSimilarByFlavor(target, [far, near, mid], { limit: 2 })
    expect(matches.map((m) => m.candidate.id)).toEqual(['near', 'mid'])
  })

  it('drops candidates beyond maxDistance, keeping the boundary (inclusive)', () => {
    // mid is at exactly 0.4 → kept; far at 0.9 → dropped.
    const matches = findSimilarByFlavor(target, [far, near, mid], { maxDistance: 0.4 })
    expect(matches.map((m) => m.candidate.id)).toEqual(['near', 'mid'])
  })

  it('excludes a candidate just beyond maxDistance', () => {
    const matches = findSimilarByFlavor(target, [mid], { maxDistance: 0.4 - 1e-9 })
    expect(matches).toHaveLength(0)
  })

  it('breaks distance ties by original input order, deterministically', () => {
    // Two candidates equidistant from target (both at f1 = 0.2) must keep the
    // order they were passed in — no dependence on sort stability luck.
    const tieA = { id: 'tieA', ...axesAt(0.2) }
    const tieB = { id: 'tieB', ...axesAt(0.2) }
    expect(findSimilarByFlavor(target, [tieB, tieA]).map((m) => m.candidate.id)).toEqual([
      'tieB',
      'tieA',
    ])
    expect(findSimilarByFlavor(target, [tieA, tieB]).map((m) => m.candidate.id)).toEqual([
      'tieA',
      'tieB',
    ])
  })

  it('ranks a candidate identical to the target first at distance 0', () => {
    const exact = { id: 'exact', ...axesAt(0) }
    const matches = findSimilarByFlavor(target, [mid, exact, near])
    expect(matches[0]!.candidate.id).toBe('exact')
    expect(matches[0]!.distance).toBe(0)
  })

  it('returns an empty array for no candidates', () => {
    expect(findSimilarByFlavor(target, [])).toEqual([])
  })

  it('drops candidates with a NaN axis instead of poisoning the ranking', () => {
    // A sake with no flavor chart (sparse coverage, ADR-0016) arrives with a
    // NaN axis → NaN distance. It must be dropped, and — critically — with NO
    // maxDistance set, so this pins the explicit NaN guard, not the range
    // filter. The valid candidates still rank normally.
    const noChart = { id: 'noChart', f1: Number.NaN, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    const matches = findSimilarByFlavor(target, [noChart, far, near])
    expect(matches.map((m) => m.candidate.id)).toEqual(['near', 'far'])
    expect(matches.every((m) => !Number.isNaN(m.distance))).toBe(true)
  })
})
