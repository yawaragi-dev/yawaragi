import { describe, expect, it } from 'vitest'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import {
  type FlavorCandidate,
  isColdStart,
  ratedBrandIds,
  recommendByTasteProfile,
  recommendFromTasteEvents,
} from '@/lib/taste/taste-recommender'

const NOW = 1_700_000_000_000
const TOP = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }

// Candidates on the f1 axis at known distances from a top-of-f1 vector.
const axesAt = (f1: number) => ({ f1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 })
const cand = (brandId: number, f1: number): FlavorCandidate => ({ brandId, ...axesAt(f1) })

const ratingEvent = (brandId: number, stars = 5): TasteEvent => ({
  kind: 'rating',
  rating: stars,
  brandId,
  target: TOP,
  occurredAt: NOW,
})

describe('ratedBrandIds', () => {
  it('collects brandIds from rating and scan-accept events, ignoring cross-beverage seeds', () => {
    const events: TasteEvent[] = [
      ratingEvent(11),
      { kind: 'scan_accept', brandId: 22, target: TOP, occurredAt: NOW },
      { kind: 'cross_beverage_seed', descriptor: 'smoky', target: TOP, occurredAt: NOW },
    ]
    expect(ratedBrandIds(events)).toEqual(new Set([11, 22]))
  })
})

describe('isColdStart', () => {
  it('is true only with no events', () => {
    expect(isColdStart([])).toBe(true)
    expect(isColdStart([ratingEvent(1)])).toBe(false)
  })
})

describe('recommendByTasteProfile', () => {
  const vector = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 } // top of f1

  it('ranks candidates nearest to the vector first', () => {
    const results = recommendByTasteProfile(vector, [cand(1, 0.2), cand(2, 0.9), cand(3, 0.6)])
    expect(results.map((r) => r.candidate.brandId)).toEqual([2, 3, 1])
  })

  it('excludes brands the user already rated (brand-exclusion lives here)', () => {
    const results = recommendByTasteProfile(vector, [cand(1, 0.9), cand(2, 0.8), cand(3, 0.7)], {
      excludeBrandIds: new Set([1]),
    })
    expect(results.map((r) => r.candidate.brandId)).toEqual([2, 3])
    expect(results.some((r) => r.candidate.brandId === 1)).toBe(false)
  })

  it('respects the limit', () => {
    const results = recommendByTasteProfile(vector, [cand(1, 0.9), cand(2, 0.8), cand(3, 0.7)], {
      limit: 2,
    })
    expect(results).toHaveLength(2)
  })

  it('returns an empty list for no candidates', () => {
    expect(recommendByTasteProfile(vector, [])).toEqual([])
  })
})

describe('recommendFromTasteEvents', () => {
  const candidates = [cand(10, 0.9), cand(20, 0.5), cand(30, 0.1)]

  it('signals cold start when there are no events', () => {
    expect(recommendFromTasteEvents([], candidates, NOW)).toEqual({ kind: 'cold_start' })
  })

  it('ranks against the derived vector and excludes the rated brand', () => {
    // A single 5-star on brand 10 pulls the vector up toward its (high-f1)
    // profile, so the remaining candidates rank by proximity to that — and
    // brand 10 itself is excluded (already rated).
    const result = recommendFromTasteEvents([ratingEvent(10)], candidates, NOW)
    expect(result.kind).toBe('ranked')
    if (result.kind !== 'ranked') return
    expect(result.results.some((r) => r.candidate.brandId === 10)).toBe(false)
    // brand 20 (f1 0.5) is nearer the nudged vector than brand 30 (f1 0.1).
    expect(result.results.map((r) => r.candidate.brandId)).toEqual([20, 30])
  })

  it('honours the limit on ranked results', () => {
    const result = recommendFromTasteEvents([ratingEvent(999)], candidates, NOW, { limit: 1 })
    expect(result.kind).toBe('ranked')
    if (result.kind !== 'ranked') return
    expect(result.results).toHaveLength(1)
  })
})
